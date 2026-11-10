"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamUser } from "@/lib/auth";
import { canCreateProjects, canDeleteProject, canEditField, canManageBrands, canManageCollaborators, canManageTeam, canSeeAll, canViewProject, isAdmin, type Access } from "@/lib/rbac";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPARTMENTS, DEPTS, EDIT_STATUSES, FINAL_APPROVAL,
  PREPRO_STAGES, PRIORITIES, REVISION_ALERT_ROUND, ROLES, SCRIPT_STAGES, SHOOT_STATUSES,
} from "@/lib/constants";
import { forViewer, taskInclude, toTaskDTO, type StorageDTO, type TaskDTO, type TimeEntryDTO } from "@/lib/dto";
export type { TimeEntryDTO } from "@/lib/dto";
import {
  notify,
  onAssigned,
  onClosed,
  onFinalApproved,
  onFirstCutSent,
  onRevisionAlert,
  onTimelineRevised,
  onWorkSessionStarted,
  onWorkSessionStopped,
  sendSmartReminderStage,
  type SmartReminderStage,
} from "@/lib/notify";
import { APP_URL, emailHtml, isEmailEnabled, sendMail } from "@/lib/mailer";
import { runDailyAutomations, type DailyResult } from "@/lib/automations";
import {
  syncProjectToGoogleCalendar,
  deleteProjectFromGoogleCalendar,
  syncAllUserTasksToGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGoogleCalendarEvents,
} from "@/lib/google-calendar";

const ENUMS: Record<string, readonly string[]> = {
  priority: PRIORITIES,
  dept: DEPTS,
  briefStage: BRIEF_STAGES,
  scriptStage: SCRIPT_STAGES,
  preProStage: PREPRO_STAGES,
  shootStatus: SHOOT_STATUSES,
  editStatus: EDIT_STATUSES,
  clientReview: CLIENT_REVIEW,
  finalApproval: FINAL_APPROVAL,
  deliveryStatus: DELIVERY_STATUSES,
};
const TEXT = new Set(["title", "type", "platform", "notes", "context", "workType"]);
const DATES = new Set(["externalDeadline", "internalDeadline", "startAt", "endAt"]);
const REFS = new Set(["brandId", "campaignId", "assigneeId", "storageId"]);
const NUMS = new Set(["version", "cost"]);
const BOOLS = new Set(["onHold"]);

// Run slow side work (history, notifications, emails) after the response is
// sent, so the person clicking doesn't wait for it.
function later(label: string, fn: () => Promise<unknown>) {
  after(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[background] ${label} failed`, e);
    }
  });
}

// Who can see / edit a task, from a loaded row.
type AccessRow = {
  assigneeId: string | null;
  createdById: string | null;
  brandId: string | null;
  collaborators: { id: string }[];
  subtasks: { assigneeId: string | null }[];
};
function access(p: AccessRow): Access {
  return {
    assigneeId: p.assigneeId,
    createdById: p.createdById,
    brandId: p.brandId,
    collaboratorIds: p.collaborators.map((c) => c.id),
    subtaskAssigneeIds: p.subtasks.map((x) => x.assigneeId).filter((x): x is string => !!x),
  };
}
const accessSelect = {
  assigneeId: true,
  createdById: true,
  brandId: true,
  title: true,
  collaborators: { select: { id: true } },
  subtasks: { select: { assigneeId: true } },
} as const;

// Loads a task and checks the person can see it.
async function viewTask(id: string) {
  const [me, p] = await Promise.all([requireTeamUser(), prisma.project.findUnique({ where: { id }, select: accessSelect })]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  return { me, p };
}

const IST = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// Link to a task for a given person (team members open it from My tasks).
function taskHref(role: string, id: string) {
  return role === "ADMIN" || role === "MANAGER" ? `/projects?task=${id}` : `/my-tasks?task=${id}`;
}

const FIELD_LABEL: Record<string, string> = {
  title: "Title", type: "Type", platform: "Platform", dept: "Dept", priority: "Priority",
  briefStage: "Brief", scriptStage: "Concept / script", preProStage: "Pre-pro", shootStatus: "Shoot",
  editStatus: "Edit status", revisionRound: "Revision round", clientReview: "Client review",
  finalApproval: "Final approval", deliveryStatus: "Delivery", notes: "Notes", context: "Description",
  externalDeadline: "External deadline", internalDeadline: "Due date", brandId: "Brand", campaignId: "Campaign",
  assigneeId: "Assignee", workType: "Work Type", version: "Version", cost: "Cost",
  onHold: "On hold", startAt: "Start", endAt: "End", storageId: "Storage",
};

function coerce(field: string, raw: unknown): unknown {
  if (field in ENUMS) {
    const v = String(raw ?? "");
    if (!ENUMS[field].includes(v)) throw new Error(`Invalid value for ${FIELD_LABEL[field]}`);
    return v;
  }
  if (field === "revisionRound") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error("Invalid revision round");
    return n;
  }
  if (NUMS.has(field)) {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (isNaN(n)) throw new Error(`Invalid number for ${FIELD_LABEL[field]}`);
    return n;
  }
  if (TEXT.has(field)) {
    const v = raw == null ? "" : String(raw).trim();
    if (field === "title" && !v) throw new Error("Title can't be empty");
    return v || null;
  }
  if (DATES.has(field)) {
    if (!raw) return null;
    const d = new Date(String(raw));
    if (isNaN(d.getTime())) throw new Error("Invalid date");
    return d;
  }
  if (REFS.has(field)) return raw ? String(raw) : null;
  if (BOOLS.has(field)) return raw === true || raw === "true";
  throw new Error(`Unknown field ${field}`);
}

function show(v: unknown, field: string) {
  if (v == null || v === "") return "—";
  if (v instanceof Date) return field === "startAt" || field === "endAt" ? IST(v) : v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).slice(0, 200) + (field === "notes" && String(v).length > 200 ? "…" : "");
}

// Inline edit from any view (list cell, board card, side panel).
export async function updateTask(id: string, patch: Record<string, unknown>): Promise<TaskDTO> {
  const [me, before] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id }, include: taskInclude }),
  ]);
  if (!before) throw new Error("Task not found");
  if (!canViewProject(me, access(before))) throw new Error("Not allowed");

  const data: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(patch)) {
    if (!canEditField(me, field, access(before))) throw new Error(`You can't change ${FIELD_LABEL[field] ?? field}`);
    data[field] = coerce(field, raw);
  }

  // Auto-fills carried over from the Apps Script
  if (typeof data.editStatus === "string") {
    const m = (data.editStatus as string).match(/^External Revision R(\d)/);
    if (m && data.revisionRound === undefined) data.revisionRound = Math.max(before.revisionRound, Number(m[1]));
    if (data.editStatus === "Final Approved" && before.finalApproval !== "Approved" && data.finalApproval === undefined)
      data.finalApproval = "Approved";
    if (data.editStatus === "First Cut Sent" && before.clientReview === "NA" && data.clientReview === undefined)
      data.clientReview = "Pending";
    if (data.editStatus !== before.editStatus) data.statusChangedAt = new Date();
  }
  if (data.deliveryStatus === "Project Closed" && before.deliveryStatus !== "Project Closed") data.closedAt = new Date();
  if (data.deliveryStatus && data.deliveryStatus !== "Project Closed") data.closedAt = null;
  if ("externalDeadline" in data && before.externalDeadline && String(data.externalDeadline) !== String(before.externalDeadline))
    data.extDeadlineChanges = before.extDeadlineChanges + 1;
  if ("internalDeadline" in data && before.internalDeadline && String(data.internalDeadline) !== String(before.internalDeadline))
    data.intDeadlineChanges = before.intDeadlineChanges + 1;
  if (before.assigneeId === me.id) {
    data.lastTeamUpdateAt = new Date();
    data.reminderCount = 0;
  }
  if ("assigneeId" in data && data.assigneeId !== before.assigneeId) {
    data.lastTeamUpdateAt = new Date(); // reminder clock starts at assignment
    data.reminderCount = 0;
  }

  const after = await prisma.project.update({ where: { id }, data, include: taskInclude });

  // If deliverable deadline changed and belongs to a campaign, sync all sister deliverables & campaign
  const targetCampaignId = (data.campaignId as string) || (before as any).campaignId || before.campaign?.id;
  if (targetCampaignId && ("internalDeadline" in data || "externalDeadline" in data)) {
    const syncData: Record<string, unknown> = {};
    if ("internalDeadline" in data) syncData.internalDeadline = data.internalDeadline;
    if ("externalDeadline" in data) syncData.externalDeadline = data.externalDeadline;
    later("sync campaign deadline", async () => {
      try {
        await prisma.campaign.update({
          where: { id: targetCampaignId },
          data: syncData,
        });
        await prisma.project.updateMany({
          where: { campaignId: targetCampaignId, archived: false, id: { not: id } },
          data: syncData,
        });
      } catch (e) {
        console.error("Failed to cascade campaign deadline:", e);
      }
    });
  }

  const changes = Object.keys(patch).filter((f) => show((before as any)[f], f) !== show((after as any)[f], f));
  later("task history + automations", async () => {
  if (changes.length) {
    const names = async (f: string, v: unknown) => {
      if (f === "brandId" && v) return (await prisma.brand.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "campaignId" && v) return (await prisma.campaign.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "assigneeId" && v) return (await prisma.user.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "storageId" && v) return (await prisma.storage.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      return show(v, f);
    };
    await prisma.activity.createMany({
      data: await Promise.all(
        changes.map(async (f) => ({
          projectId: id,
          actorName: me.name,
          field: f === "assigneeId" ? "Handover" : (FIELD_LABEL[f] ?? f),
          fromValue: await names(f, (before as any)[f]),
          toValue: await names(f, (after as any)[f]),
        })),
      ),
    });
  }

  // On-edit automations: send Smart Assignment & Deadline Card when assignee or deadline is set by manager
  const deadlineChanged =
    "internalDeadline" in patch &&
    String(after.internalDeadline?.toISOString() ?? "") !== String(before.internalDeadline?.toISOString() ?? "");
  if (after.assigneeId && (after.assigneeId !== before.assigneeId || deadlineChanged)) {
    await onAssigned(after, me);
  }
  if (after.editStatus === "First Cut Sent" && before.editStatus !== "First Cut Sent") await onFirstCutSent(after);
  if (after.revisionRound >= REVISION_ALERT_ROUND && before.revisionRound < REVISION_ALERT_ROUND) await onRevisionAlert(after);
  if (after.finalApproval === "Approved" && before.finalApproval !== "Approved") await onFinalApproved(after);
  if (after.deliveryStatus === "Project Closed" && before.deliveryStatus !== "Project Closed") await onClosed(after);

  // Sync to Google Calendar (if assignee has Google Calendar connected)
  await syncProjectToGoogleCalendar(after.id);
  });

  // No page refresh needed: the screen already shows the change.
  return forViewer(toTaskDTO(after), canSeeAll(me));
}

async function nextCode() {
  const rows = await prisma.project.findMany({ select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const n = Number(r.code.match(/^TBM-(\d+)/)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return `TBM-${String(max + 1).padStart(3, "0")}`;
}

export async function createTask(input: {
  title: string;
  brandId?: string | null;
  campaignId?: string | null;
  assigneeId?: string | null;
  internalDeadline?: string | null;
  externalDeadline?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  storageId?: string | null;
  context?: string | null;
  notes?: string | null;
  priority?: string;
  type?: string | null;
  workType?: string | null;
  version?: number;
  cost?: number | null;
  platform?: string | null;
  collaboratorIds?: string[];
  initialDriveUrl?: string | null;
  initialSubtasks?: { title: string; assigneeId?: string | null; dueDate?: string | null }[];
}): Promise<TaskDTO> {
  const me = await requireTeamUser();
  if (!canCreateProjects(me)) throw new Error("You can't add tasks");

  // Mandatory brand and campaign check (Feedback: "A task cannot be saved without a brand and a campaign")
  if (!input.brandId?.trim()) {
    throw new Error("A task cannot be saved without a brand. Please select a brand.");
  }
  if (!input.campaignId?.trim()) {
    throw new Error("A task cannot be saved without a campaign. Please select a campaign.");
  }

  const title = input.title?.trim();
  if (!title) throw new Error("Give the task a name");

  const [brand, campaign] = await Promise.all([
    prisma.brand.findUnique({ where: { id: input.brandId } }),
    prisma.campaign.findUnique({ where: { id: input.campaignId } }),
  ]);
  if (!brand) throw new Error("Selected brand does not exist");
  if (!campaign) throw new Error("Selected campaign does not exist");

  const seeAll = canSeeAll(me);
  const collabIds = [...new Set((input.collaboratorIds ?? []).filter(Boolean))];
  // Team members assign tasks to themselves, except inside a brand workspace
  // they belong to, where they can assign anyone (like an Asana project).
  const inWorkspace = me.brandIds.includes(input.brandId);
  const assigneeId = seeAll || inWorkspace ? input.assigneeId || (seeAll ? null : me.id) : me.id;
  const when = (v?: string | null) => (v && !isNaN(new Date(v).getTime()) ? new Date(v) : null);

  // Inherit deadlines from campaign if not specified directly
  const intDl = when(input.internalDeadline) ?? campaign.internalDeadline;
  const extDl = (seeAll && input.externalDeadline ? when(input.externalDeadline) : null) ?? campaign.externalDeadline;

  const p = await prisma.project.create({
    data: {
      code: await nextCode(),
      title,
      brandId: input.brandId,
      campaignId: input.campaignId,
      assigneeId,
      createdById: me.id,
      collaborators: collabIds.length ? { connect: collabIds.map((id) => ({ id })) } : undefined,
      priority: input.priority && PRIORITIES.includes(input.priority as any) ? input.priority : "Medium",
      type: input.type || null,
      workType: input.workType || null,
      version: input.version || 1,
      cost: input.cost != null ? Number(input.cost) : null,
      platform: input.platform || null,
      internalDeadline: intDl,
      startAt: when(input.startAt),
      endAt: when(input.endAt),
      storageId: input.storageId || null,
      context: input.context?.trim() || null,
      notes: input.notes?.trim() || null,
      externalDeadline: extDl,
      lastTeamUpdateAt: new Date(),
    },
    include: taskInclude,
  });

  if (input.initialDriveUrl?.trim()) {
    await prisma.attachment.create({
      data: {
        projectId: p.id,
        name: "Master Footage / Assets Drive",
        url: input.initialDriveUrl.trim(),
        addedByName: me.name,
      },
    });
  }

  if (input.initialSubtasks && input.initialSubtasks.length > 0) {
    for (let i = 0; i < input.initialSubtasks.length; i++) {
      const s = input.initialSubtasks[i];
      if (!s.title?.trim()) continue;
      await prisma.subtask.create({
        data: {
          projectId: p.id,
          title: s.title.trim(),
          assigneeId: s.assigneeId || assigneeId || null,
          dueDate: s.dueDate ? new Date(s.dueDate) : intDl,
          position: i,
        },
      });
    }
  }

  const fullProject = (input.initialDriveUrl?.trim() || (input.initialSubtasks && input.initialSubtasks.length > 0))
    ? await prisma.project.findUnique({ where: { id: p.id }, include: taskInclude })
    : p;
  const finalP = fullProject || p;

  later("new task notifications", async () => {
    await prisma.activity.create({ data: { projectId: finalP.id, actorName: me.name, field: "Created", toValue: finalP.title } });
    if (finalP.assigneeId) await onAssigned(finalP, me);
    for (const c of finalP.collaborators) {
      if (c.id === me.id || c.id === finalP.assigneeId) continue;
      const u = await prisma.user.findUnique({ where: { id: c.id } });
      if (u) await notify(u.id, `${me.name} added you to ${finalP.title}`, "You're a collaborator on this task", taskHref(u.role, finalP.id));
    }
    // Sync newly created task to assignee's Google Calendar
    await syncProjectToGoogleCalendar(finalP.id);
  });
  return forViewer(toTaskDTO(finalP), seeAll);
}

// Collaborators: they can see the task, comment on it and get its updates.
export async function addCollaborator(projectId: string, userId: string): Promise<TaskDTO> {
  const [me, p, u] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id: projectId }, include: taskInclude }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!p) throw new Error("Task not found");
  if (!canManageCollaborators(me, access(p))) throw new Error("Only the assignee, the person who added it, or a manager can add collaborators");
  if (!u || !u.active) throw new Error("That person isn't active");
  const after = await prisma.project.update({
    where: { id: projectId },
    data: { collaborators: { connect: { id: userId } } },
    include: taskInclude,
  });
  later("collaborator added", async () => {
    await prisma.activity.create({ data: { projectId, actorName: me.name, field: "Collaborator", toValue: `Added ${u.name}` } });
    if (u.id !== me.id) await notify(u.id, `${me.name} added you to ${p.title}`, "You're a collaborator on this task", taskHref(u.role, p.id));
  });
  return forViewer(toTaskDTO(after), canSeeAll(me));
}

export async function removeCollaborator(projectId: string, userId: string): Promise<TaskDTO> {
  const [me, p] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id: projectId }, include: taskInclude }),
  ]);
  if (!p) throw new Error("Task not found");
  // You can always remove yourself; otherwise the same people who can add.
  if (userId !== me.id && !canManageCollaborators(me, access(p))) throw new Error("Not allowed");
  const after = await prisma.project.update({
    where: { id: projectId },
    data: { collaborators: { disconnect: { id: userId } } },
    include: taskInclude,
  });
  later("collaborator removed", async () => {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.activity.create({ data: { projectId, actorName: me.name, field: "Collaborator", toValue: `Removed ${u?.name ?? "someone"}` } });
  });
  return forViewer(toTaskDTO(after), canSeeAll(me));
}

export async function setArchived(id: string, archived: boolean) {
  const me = await requireTeamUser();
  const p = await prisma.project.findUnique({ where: { id }, include: taskInclude });
  if (!p) throw new Error("Task not found");
  if (!canDeleteProject(me, access(p))) throw new Error("Not allowed");
  await prisma.project.update({ where: { id }, data: { archived } });
  later("archive history", () =>
    prisma.activity.create({ data: { projectId: id, actorName: me.name, field: archived ? "Moved to Completed" : "Moved back to active" } }),
  );
}

export async function deleteTask(id: string) {
  const me = await requireTeamUser();
  const p = await prisma.project.findUnique({ where: { id }, include: taskInclude });
  if (!p) throw new Error("Task not found");
  if (!canDeleteProject(me, access(p))) throw new Error("You can only delete tasks you own or created");
  // Point 2 & 3 Anti-tamper check: Goal-linked tasks keep audit trail for non-admins/managers
  if (!canSeeAll(me) && p.brandId) {
    const linkedGoals = await prisma.goal.count({
      where: {
        OR: [{ brandId: p.brandId }, { ownerId: me.id }],
        status: { not: "Achieved" },
      },
    });
    if (linkedGoals > 0) {
      await prisma.project.update({ where: { id }, data: { archived: true } });
      await prisma.activity.create({
        data: {
          projectId: id,
          actorName: me.name,
          field: "Goal-Linked Archive",
          toValue: "Task archived (Goal-linked tasks keep audit history)",
        },
      });
      return;
    }
  }
  later("delete from google calendar", () => deleteProjectFromGoogleCalendar(id));
  await prisma.project.delete({ where: { id } });
}

export type UpdateDTO = { id: string; authorId: string | null; authorName: string; body: string; createdAt: string };
export type ActivityDTO = { id: string; actorName: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string };

export type SubtaskDTO = { id: string; title: string; assigneeId: string | null; dueDate: string | null; done: boolean };
export type AttachmentDTO = { id: string; name: string; url: string; mimeType: string | null; iconUrl: string | null; addedByName: string; createdAt: string };
type Thread = { updates: UpdateDTO[]; activity: ActivityDTO[]; subtasks: SubtaskDTO[]; attachments: AttachmentDTO[] };

const subtaskDTO = (x: { id: string; title: string; assigneeId: string | null; dueDate: Date | null; done: boolean }): SubtaskDTO => ({
  id: x.id, title: x.title, assigneeId: x.assigneeId, dueDate: x.dueDate?.toISOString() ?? null, done: x.done,
});
const attachmentDTO = (a: { id: string; name: string; url: string; mimeType: string | null; iconUrl: string | null; addedByName: string; createdAt: Date }): AttachmentDTO => ({
  ...a, createdAt: a.createdAt.toISOString(),
});

export async function getTaskThread(id: string): Promise<Thread> {
  const [me, p, updates, activity, subtasks, attachments] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id }, select: accessSelect }),
    prisma.update.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    prisma.activity.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.subtask.findMany({ where: { projectId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.attachment.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  return {
    updates: updates.map((u) => ({ id: u.id, authorId: u.authorId, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() })),
    // Team members don't see client-deadline changes in the history either
    activity: activity
      .filter((a) => canSeeAll(me) || a.field !== "External deadline")
      .map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    subtasks: subtasks.map(subtaskDTO),
    attachments: attachments.map(attachmentDTO),
  };
}

// ---------- Subtasks ----------
export async function addSubtask(projectId: string, input: { title: string; assigneeId?: string | null; dueDate?: string | null }): Promise<SubtaskDTO> {
  const { me, p } = await viewTask(projectId);
  const title = input.title?.trim();
  if (!title) throw new Error("Give the subtask a name");
  const count = await prisma.subtask.count({ where: { projectId } });
  const st = await prisma.subtask.create({
    data: {
      projectId,
      title,
      assigneeId: input.assigneeId || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      position: count,
    },
  });
  later("subtask added", async () => {
    await prisma.activity.create({ data: { projectId, actorName: me.name, field: "Subtask", toValue: `Added "${title}"` } });
    if (st.assigneeId && st.assigneeId !== me.id) await notifySubtask(st.assigneeId, me.name, title, p.title, projectId);
  });
  return subtaskDTO(st);
}

async function notifySubtask(userId: string, by: string, title: string, taskTitle: string, projectId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !u.active) return;
  const href = taskHref(u.role, projectId);
  await notify(u.id, `${by} gave you a subtask: ${title}`, `On ${taskTitle}`, href);
  await sendMail(
    u.email,
    `☑️ New subtask — ${title}`,
    emailHtml({ heading: "You have a new subtask", intro: `${by} assigned you "${title}" on ${taskTitle}.`, cta: { label: "Open task", href: `${APP_URL}${href}` } }),
  );
}

export async function updateSubtask(
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null; done?: boolean },
): Promise<SubtaskDTO> {
  const before = await prisma.subtask.findUnique({ where: { id } });
  if (!before) throw new Error("Subtask not found");
  const { me, p } = await viewTask(before.projectId);
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error("Subtask name can't be empty");
    data.title = patch.title.trim();
  }
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId || null;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if (patch.done !== undefined) data.done = !!patch.done;
  const st = await prisma.subtask.update({ where: { id }, data });
  later("subtask updated", async () => {
    if (patch.done !== undefined && patch.done !== before.done)
      await prisma.activity.create({ data: { projectId: st.projectId, actorName: me.name, field: "Subtask", toValue: `${st.done ? "Completed" : "Reopened"} "${st.title}"` } });
    if (st.assigneeId && st.assigneeId !== before.assigneeId && st.assigneeId !== me.id)
      await notifySubtask(st.assigneeId, me.name, st.title, p.title, st.projectId);
  });
  return subtaskDTO(st);
}

export async function deleteSubtask(id: string) {
  const st = await prisma.subtask.findUnique({ where: { id } });
  if (!st) return;
  const { me } = await viewTask(st.projectId);
  await prisma.subtask.delete({ where: { id } });
  later("subtask deleted", () =>
    prisma.activity.create({ data: { projectId: st.projectId, actorName: me.name, field: "Subtask", toValue: `Removed "${st.title}"` } }),
  );
}

// ---------- Attachments (Google Drive files or any link) ----------
export async function addAttachments(
  projectId: string,
  files: { name: string; url: string; mimeType?: string | null; iconUrl?: string | null }[],
): Promise<AttachmentDTO[]> {
  const { me } = await viewTask(projectId);
  const clean = files
    .map((f) => ({ name: (f.name || f.url).trim().slice(0, 200), url: f.url.trim(), mimeType: f.mimeType ?? null, iconUrl: f.iconUrl ?? null }))
    .filter((f) => /^https?:\/\//i.test(f.url));
  if (!clean.length) throw new Error("Paste a link that starts with https://");
  const rows = await prisma.$transaction(
    clean.map((f) => prisma.attachment.create({ data: { projectId, ...f, addedByName: me.name } })),
  );
  later("attachments added", () =>
    prisma.activity.create({ data: { projectId, actorName: me.name, field: "Attachment", toValue: `Added ${rows.map((r) => r.name).join(", ")}`.slice(0, 200) } }),
  );
  return rows.map(attachmentDTO);
}

export async function deleteAttachment(id: string) {
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return;
  const { me } = await viewTask(a.projectId);
  await prisma.attachment.delete({ where: { id } });
  later("attachment removed", () =>
    prisma.activity.create({ data: { projectId: a.projectId, actorName: me.name, field: "Attachment", toValue: `Removed ${a.name}` } }),
  );
}

// ---------- Storage names (hard drives / folders) ----------
export async function createStorage(name: string): Promise<StorageDTO> {
  await requireTeamUser();
  const n = name.trim();
  if (!n) throw new Error("Give the storage a name");
  const existing = await prisma.storage.findFirst({ where: { name: { equals: n, mode: "insensitive" } } });
  if (existing) return { id: existing.id, name: existing.name };
  const s = await prisma.storage.create({ data: { name: n } });
  return { id: s.id, name: s.name };
}

export async function deleteStorage(id: string) {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can remove storage names");
  await prisma.storage.delete({ where: { id } });
  revalidatePath("/brands");
}

// ---------- Brand workspace members ----------
export async function addBrandMember(brandId: string, userId: string) {
  const me = await requireTeamUser();
  if (!canSeeAll(me) && !me.brandIds.includes(brandId)) throw new Error("Only workspace members or admins can add people");
  const [u, brand] = await Promise.all([prisma.user.findUnique({ where: { id: userId } }), prisma.brand.findUnique({ where: { id: brandId } })]);
  if (!u || !u.active || !brand) throw new Error("Not found");
  await prisma.brand.update({ where: { id: brandId }, data: { members: { connect: { id: userId } } } });
  later("workspace member added", async () => {
    if (u.id === me.id) return;
    await notify(u.id, `${me.name} added you to the ${brand.name} workspace`, "You can now see all its tasks", `/brands/${brandId}`);
  });
  revalidatePath("/", "layout");
}

export async function removeBrandMember(brandId: string, userId: string) {
  const me = await requireTeamUser();
  if (!canSeeAll(me) && userId !== me.id) throw new Error("Only admins and managers can remove other people");
  await prisma.brand.update({ where: { id: brandId }, data: { members: { disconnect: { id: userId } } } });
  revalidatePath("/", "layout");
}

// Comments (Asana-style). Everyone on the task is notified; @Name mentions
// notify (and email) that person and add them as a collaborator so they can
// open the task. Commenting also makes you a collaborator.
export async function addUpdate(projectId: string, body: string): Promise<UpdateDTO> {
  const text = body.trim();
  if (!text) throw new Error("Write something first");
  const [me, p] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id: projectId }, include: taskInclude }),
  ]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  const u = await prisma.update.create({ data: { projectId, authorId: me.id, authorName: me.name, body: text } });

  // Collaborators, notifications and emails happen after the reply.
  later("comment notifications", async () => {

  const people = await prisma.user.findMany({ where: { active: true } });
  const lower = text.toLowerCase();
  const mentioned = people.filter((x) => x.id !== me.id && lower.includes("@" + x.name.toLowerCase()));

  const existing = new Set(p.collaborators.map((c) => c.id));
  const toConnect = [
    ...mentioned.filter((x) => !existing.has(x.id) && x.id !== p.assigneeId),
    ...(me.id !== p.assigneeId && me.id !== p.createdById && !existing.has(me.id) ? [me] : []),
  ];
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(toConnect.length ? { collaborators: { connect: [...new Set(toConnect.map((x) => x.id))].map((id) => ({ id })) } } : {}),
      ...(p.assigneeId === me.id ? { lastTeamUpdateAt: new Date(), reminderCount: 0 } : {}),
    },
  });

  // Notify everyone on the task (except me); mentions get a stronger note + email.
  const snippet = text.length > 120 ? text.slice(0, 117) + "…" : text;
  const followers = new Set<string>([p.assigneeId ?? "", p.createdById ?? "", ...existing].filter(Boolean));
  const mentionedIds = new Set(mentioned.map((x) => x.id));
  for (const id of followers) {
    if (id === me.id || mentionedIds.has(id)) continue;
    const f = people.find((x) => x.id === id);
    if (f) {
      await notify(f.id, `${me.name} commented on ${p.title}`, snippet, taskHref(f.role, p.id));
      if (f.email) {
        await sendMail(
          f.email,
          `💬 ${me.name}: Update on "${p.title}"`,
          emailHtml({
            heading: `New comment on ${p.title}`,
            intro: `**${me.name}** posted an update on **${p.title}**${p.brand ? ` (${p.brand.name})` : ""}:\n\n"${text}"`,
            cta: { label: "Open Deliverable & Reply", href: `${APP_URL}${taskHref(f.role, p.id)}` },
          })
        );
      }
    }
  }
  for (const m of mentioned) {
    await notify(m.id, `${me.name} mentioned you on ${p.title}`, snippet, taskHref(m.role, p.id));
    await sendMail(
      m.email,
      `💬 ${me.name} mentioned you on ${p.title}`,
      emailHtml({
        heading: `${me.name} mentioned you`,
        intro: `On "${p.title}"${p.brand ? ` (${p.brand.name})` : ""}:\n\n${text}`,
        cta: { label: "Open task", href: `${APP_URL}${taskHref(m.role, p.id)}` },
      }),
    );
  }
  });

  return { id: u.id, authorId: u.authorId, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() };
}

export async function deleteUpdate(id: string) {
  const me = await requireTeamUser();
  const u = await prisma.update.findUnique({ where: { id } });
  if (!u) return;
  if (u.authorId !== me.id && !isAdmin(me)) throw new Error("You can only delete your own comments");
  await prisma.update.delete({ where: { id } });
}

export async function markAllNotificationsRead() {
  const me = await requireTeamUser();
  await prisma.notification.updateMany({ where: { userId: me.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}

// ───────────────────────── Team (TEAM REGISTRY) ─────────────────────────

function randomHash() {
  return bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
}

export async function createTeamUser(input: { name: string; email: string; role: string; department: string }) {
  const me = await requireTeamUser();
  if (!canManageTeam(me)) throw new Error("Only admins can add people");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email.includes("@")) return { error: "Name and a valid email are required." };
  if (!ROLES.includes(input.role as any)) return { error: "Pick a role." };
  if (!DEPARTMENTS.includes(input.department as any)) return { error: "Pick a department." };
  if (await prisma.user.findUnique({ where: { email } })) return { error: "Someone with that email already exists." };
  if (await prisma.client.findUnique({ where: { email } })) return { error: "That email is already a client login." };
  await prisma.user.create({
    data: { name, email, role: input.role, department: input.department, passwordHash: await randomHash() },
  });
  // Welcome mail (old "tab created + email sent")
  await sendMail(
    email,
    "Your TBM project tracker is ready",
    emailHtml({
      heading: `Welcome, ${name.split(" ")[0]}`,
      intro: "You've been added to the TBM Post Production tracker. Sign in with this Google account to see the tasks assigned to you, update their status and drop your notes and links.",
      cta: { label: "Open my tasks", href: `${APP_URL}/my-tasks` },
    }),
  );
  revalidatePath("/team");
  return { ok: true };
}

export async function updateTeamUser(
  id: string,
  patch: { role?: string; department?: string; active?: boolean; name?: string; hourlyRate?: number | null }
) {
  const me = await requireTeamUser();
  if (!canManageTeam(me)) throw new Error("Only admins can change people");
  if (id === me.id && ((patch.role && patch.role !== "ADMIN") || patch.active === false))
    throw new Error("You can't demote or deactivate yourself");
  const data: Record<string, unknown> = {};
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role as any)) throw new Error("Invalid role");
    data.role = patch.role;
  }
  if (patch.department !== undefined) {
    if (!DEPARTMENTS.includes(patch.department as any)) throw new Error("Invalid department");
    data.department = patch.department;
  }
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
  if (patch.hourlyRate !== undefined) {
    data.hourlyRate = patch.hourlyRate === null ? null : Math.max(0, Math.round(Number(patch.hourlyRate)));
  }
  await prisma.user.update({ where: { id }, data });
  revalidatePath("/", "layout");
}

export async function setTeamUserPassword(id: string, password: string | null) {
  const me = await requireTeamUser();
  if (!canManageTeam(me)) throw new Error("Only admins can set passwords");
  if (password !== null && password.length < 8) throw new Error("Use at least 8 characters");
  await prisma.user.update({
    where: { id },
    data: { passwordHash: password === null ? await randomHash() : await bcrypt.hash(password, 10) },
  });
}

export async function deleteTeamUser(id: string) {
  const me = await requireTeamUser();
  if (!canManageTeam(me)) throw new Error("Only admins can remove people");
  if (id === me.id) throw new Error("You can't remove yourself");
  // Their tasks become unassigned (onDelete: SetNull), history stays.
  await prisma.user.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ───────────────────────── Brands (BRAND REGISTRY) ─────────────────────────

export async function createBrand(input: {
  name: string;
  pocName?: string;
  pocEmail?: string;
  color?: string;
  repositoryUrl?: string;
  guidelines?: string;
}) {
  const me = await requireTeamUser();
  if (me.role === "CLIENT") throw new Error("Clients cannot add brands");
  const name = input.name.trim();
  if (!name) return { error: "Brand name is required." };
  if (await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { error: "That brand already exists." };
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? input.color! : "#5b3fd1";
  const b = await prisma.brand.create({
    data: {
      name,
      pocName: input.pocName?.trim() || null,
      pocEmail: input.pocEmail?.trim().toLowerCase() || null,
      color,
      repositoryUrl: input.repositoryUrl?.trim() || null,
      guidelines: input.guidelines?.trim() || null,
      members: { connect: { id: me.id } },
      favoritedBy: { connect: { id: me.id } },
      campaigns: {
        create: { name: "General" },
      },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, id: b.id };
}

export async function updateBrand(id: string, patch: { name?: string; pocName?: string; pocEmail?: string; color?: string }) {
  const me = await requireTeamUser();
  if (!canManageBrands(me)) throw new Error("Only admins can edit brands");
  const data: Record<string, unknown> = {};
  if (patch.name?.trim()) data.name = patch.name.trim();
  if (patch.pocName !== undefined) data.pocName = patch.pocName.trim() || null;
  if (patch.pocEmail !== undefined) data.pocEmail = patch.pocEmail.trim().toLowerCase() || null;
  if (patch.color && /^#[0-9a-f]{6}$/i.test(patch.color)) data.color = patch.color;
  await prisma.brand.update({ where: { id }, data });
  revalidatePath("/", "layout");
}

export async function deleteBrand(id: string) {
  const me = await requireTeamUser();
  if (!canManageBrands(me)) throw new Error("Only admins can delete brands");
  const count = await prisma.project.count({ where: { brandId: id } });
  if (count) throw new Error(`This brand still has ${count} task(s). Move or delete them first.`);
  await prisma.brand.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// Brand POC login (replaces "brand sheet created + POC emailed").
export async function createClientLogin(input: { brandId: string; name: string; email: string; password: string }) {
  const me = await requireTeamUser();
  if (!canManageBrands(me)) throw new Error("Only admins can add client logins");
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email.includes("@")) return { error: "Name and a valid email are required." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };
  if ((await prisma.client.findUnique({ where: { email } })) || (await prisma.user.findUnique({ where: { email } })))
    return { error: "That email already has a login." };
  const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
  if (!brand) return { error: "Brand not found." };
  await prisma.client.create({
    data: { brandId: brand.id, name: input.name.trim(), email, passwordHash: await bcrypt.hash(input.password, 10) },
  });
  await sendMail(
    email,
    `${brand.name} × TBM — your content tracker is live`,
    emailHtml({
      heading: `${brand.name} × TBM`,
      intro: `Hi ${input.name.trim().split(" ")[0]}, your live content tracker is ready. Sign in as a Client with ${email} to see where every piece of content is. Your TBM point of contact will share your password.`,
      cta: { label: "Open your tracker", href: `${APP_URL}/login` },
      footer: "The Bored Monkey Studio",
    }),
  );
  revalidatePath("/brands");
  return { ok: true };
}

export async function deleteClientLogin(id: string) {
  const me = await requireTeamUser();
  if (!canManageBrands(me)) throw new Error("Only admins can remove client logins");
  await prisma.client.delete({ where: { id } });
  revalidatePath("/brands");
}

// "Run now" on the Automations page (admins). Same code the 8 AM cron runs.
export async function runAutomationsNow(): Promise<DailyResult> {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can run automations");
  const r = await runDailyAutomations(`Run now by ${me.name}`, { weekly: true });
  revalidatePath("/", "layout");
  return r;
}

// Trigger any of the 7 Smart Reminder & Escalation stages on demand (for testing or manual escalation)
export async function triggerSmartReminderStageAction(
  projectId: string,
  stage: SmartReminderStage
): Promise<{ ok: boolean; message: string }> {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only admins and managers can trigger smart reminder stages");
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brand: true, assignee: true, campaign: true, createdBy: true },
  });
  if (!p) throw new Error("Deliverable not found");
  await sendSmartReminderStage(p, stage, { assignerName: me.name, assignerEmail: me.email });
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Dispatched [${stage}] Slack/Jira reminder for ${p.code} (${p.title}).`,
  };
}

// "Send test email" on the Automations page — goes to the admin clicking it.
export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can send test emails");
  if (!isEmailEnabled()) {
    return {
      ok: false,
      message: process.env.DISABLE_EMAIL_NOTIFICATIONS === "true" || process.env.ENABLE_EMAIL_NOTIFICATIONS === "false"
        ? "Email notifications are disabled (DISABLE_EMAIL_NOTIFICATIONS=true)."
        : "SMTP_HOST is empty in .env. Fill in the SMTP lines and restart the app.",
    };
  }
  const r = await sendMail(
    me.email,
    "✅ TBM Post Prod Panel — test email",
    emailHtml({
      heading: "Email is working",
      intro: `This is a test from the Post Prod Panel. Reminders, assignment emails and client updates will be sent from ${process.env.SMTP_FROM || process.env.SMTP_USER}.`,
      cta: { label: "Open the panel", href: `${APP_URL}/home` },
    }),
  );
  return r.ok
    ? { ok: true, message: `Sent to ${me.email}. Check your inbox (and spam).` }
    : { ok: false, message: `Couldn't send: ${r.error}` };
}

// ---------- Favorites (starred projects in the sidebar) ----------
export async function toggleFavorite(brandId: string, on: boolean) {
  const me = await requireTeamUser();
  await prisma.user.update({
    where: { id: me.id },
    data: { favorites: on ? { connect: { id: brandId } } : { disconnect: { id: brandId } } },
  });
  revalidatePath("/", "layout");
}

// ---------- New project (brand workspace), like Asana's "+" ----------
const PROJECT_COLORS = ["#f06a6a", "#f1bd6c", "#5da283", "#4ecbc4", "#4573d2", "#8d84e8", "#e362e3", "#fd612c", "#aecf55"];
export async function createProject(input: { name: string; color?: string }): Promise<{ id: string }> {
  const me = await requireTeamUser();
  const name = input.name?.trim();
  if (!name) throw new Error("Give the project a name");
  const exists = await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (exists) throw new Error(`"${exists.name}" already exists. Ask a member or an admin to add you to it.`);
  const color = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
  const b = await prisma.brand.create({
    data: { name, color, members: { connect: { id: me.id } }, favoritedBy: { connect: { id: me.id } } },
  });
  revalidatePath("/", "layout");
  return { id: b.id };
}

// ---------- Goals ----------
const GOAL_STATUSES = ["On track", "At risk", "Off track", "Achieved"];
export async function createGoal(input: { title: string; ownerId?: string | null; brandId?: string | null; dueDate?: string | null }) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only admins and managers can add goals");
  const title = input.title?.trim();
  if (!title) throw new Error("Give the goal a name");
  await prisma.goal.create({
    data: { title, ownerId: input.ownerId || me.id, brandId: input.brandId || null, dueDate: input.dueDate ? new Date(input.dueDate) : null },
  });
  revalidatePath("/goals");
}

export async function updateGoal(id: string, patch: { title?: string; ownerId?: string | null; dueDate?: string | null; progress?: number; status?: string; notes?: string }) {
  const me = await requireTeamUser();
  const g = await prisma.goal.findUnique({ where: { id } });
  if (!g) throw new Error("Goal not found");
  if (!canSeeAll(me) && g.ownerId !== me.id) throw new Error("Only the goal owner or a manager can update it");
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined && patch.title.trim()) data.title = patch.title.trim();
  if (patch.ownerId !== undefined && canSeeAll(me)) data.ownerId = patch.ownerId || null;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if (patch.progress !== undefined) data.progress = Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0)));
  if (patch.status !== undefined && GOAL_STATUSES.includes(patch.status)) data.status = patch.status;
  if (patch.notes !== undefined) data.notes = patch.notes.trim() || null;
  if (data.progress === 100 && !data.status) data.status = "Achieved";
  await prisma.goal.update({ where: { id }, data });
  revalidatePath("/goals");
}

export async function deleteGoal(id: string) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only admins and managers can delete goals");
  await prisma.goal.delete({ where: { id } });
  revalidatePath("/goals");
}

export async function syncMyGoogleCalendar(): Promise<{ ok: boolean; synced: number; total: number; message?: string }> {
  const me = await requireTeamUser();
  try {
    const res = await syncAllUserTasksToGoogleCalendar(me.id);
    revalidatePath("/my-tasks");
    return { ok: true, synced: res.synced, total: res.total };
  } catch (err: any) {
    return { ok: false, synced: 0, total: 0, message: err?.message || "Sync failed" };
  }
}

export async function disconnectMyGoogleCalendar(): Promise<{ ok: boolean }> {
  const me = await requireTeamUser();
  await disconnectGoogleCalendar(me.id);
  revalidatePath("/my-tasks");
  return { ok: true };
}

export async function getMyGoogleCalendarStatus(): Promise<{ connected: boolean; email: string }> {
  const me = await requireTeamUser();
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    select: { email: true, googleCalendarSync: true, googleRefreshToken: true },
  });
  return {
    connected: Boolean(u?.googleCalendarSync && u?.googleRefreshToken),
    email: u?.email ?? me.email,
  };
}

export async function getMyGoogleCalendarEvents(timeMin?: string, timeMax?: string) {
  const me = await requireTeamUser();
  return fetchGoogleCalendarEvents(me.id, timeMin, timeMax);
}

// ---------- Campaigns ----------
export async function createCampaign(input: {
  brandId: string;
  name: string;
  internalDeadline?: string | null;
  externalDeadline?: string | null;
  budget?: number | null;
  repositoryUrl?: string | null;
}) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only managers and admins can create campaigns");
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required");
  const when = (v?: string | null) => (v && !isNaN(new Date(v).getTime()) ? new Date(v) : null);
  const campaign = await prisma.campaign.create({
    data: {
      brandId: input.brandId,
      name,
      internalDeadline: when(input.internalDeadline),
      externalDeadline: when(input.externalDeadline),
      budget: input.budget != null ? Number(input.budget) : null,
      repositoryUrl: input.repositoryUrl?.trim() || null,
    },
  });
  revalidatePath("/projects");
  revalidatePath("/brands");
  return campaign;
}

export async function updateCampaign(
  id: string,
  patch: {
    name?: string;
    internalDeadline?: string | null;
    externalDeadline?: string | null;
    budget?: number | null;
    repositoryUrl?: string | null;
    status?: string;
  },
) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only managers and admins can edit campaigns");
  const when = (v?: string | null) => (v && !isNaN(new Date(v).getTime()) ? new Date(v) : null);
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
  if (patch.internalDeadline !== undefined) data.internalDeadline = when(patch.internalDeadline);
  if (patch.externalDeadline !== undefined) data.externalDeadline = when(patch.externalDeadline);
  if (patch.budget !== undefined) data.budget = patch.budget != null ? Number(patch.budget) : null;
  if (patch.repositoryUrl !== undefined) data.repositoryUrl = patch.repositoryUrl?.trim() || null;
  if (patch.status !== undefined) data.status = patch.status;

  const campaign = await prisma.campaign.update({ where: { id }, data });

  // If campaign deadline changed, cascade update to all deliverables in this campaign!
  if (patch.internalDeadline !== undefined || patch.externalDeadline !== undefined) {
    const projectPatch: Record<string, unknown> = {};
    if (patch.internalDeadline !== undefined) projectPatch.internalDeadline = when(patch.internalDeadline);
    if (patch.externalDeadline !== undefined) projectPatch.externalDeadline = when(patch.externalDeadline);
    await prisma.project.updateMany({
      where: { campaignId: id, archived: false },
      data: projectPatch,
    });
  }

  revalidatePath("/projects");
  revalidatePath("/brands");
  return campaign;
}

export async function deleteCampaign(id: string) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only managers and admins can delete campaigns");
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/projects");
  revalidatePath("/brands");
}

// ---------- Time Tracking ----------
export async function addTimeEntry(input: {
  projectId: string;
  durationMinutes: number;
  workType?: string | null;
  notes?: string | null;
  date?: string | null;
}): Promise<TimeEntryDTO> {
  const me = await requireTeamUser();
  const { p } = await viewTask(input.projectId);
  if (!input.durationMinutes || input.durationMinutes <= 0) throw new Error("Enter duration in minutes");
  const when = input.date && !isNaN(new Date(input.date).getTime()) ? new Date(input.date) : new Date();

  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { hourlyRate: true, name: true } });
  const hourlyRate = user?.hourlyRate ?? 0;

  const te = await prisma.timeEntry.create({
    data: {
      projectId: input.projectId,
      userId: me.id,
      date: when,
      durationMinutes: input.durationMinutes,
      workType: input.workType?.trim() || null,
      notes: input.notes?.trim() || null,
      hourlyRate,
    },
    include: { user: { select: { name: true } } },
  });

  later("time logged activity", async () => {
    await prisma.activity.create({
      data: {
        projectId: input.projectId,
        actorName: me.name,
        field: "Time Log",
        toValue: `Logged ${Math.floor(input.durationMinutes / 60)}h ${input.durationMinutes % 60}m (${input.workType || "Work"})`,
      },
    });
  });

  return {
    id: te.id,
    projectId: te.projectId,
    userId: te.userId,
    userName: te.user.name,
    date: te.date.toISOString(),
    durationMinutes: te.durationMinutes,
    hours: Number((te.durationMinutes / 60).toFixed(1)),
    workType: te.workType,
    notes: te.notes,
    hourlyRate: te.hourlyRate,
    cost: Number(((te.durationMinutes / 60) * (te.hourlyRate || 0)).toFixed(2)),
    createdAt: te.createdAt.toISOString(),
  };
}

export async function startWorkSession(projectId: string): Promise<{ ok: boolean; startedAt: string; task: TaskDTO }> {
  const me = await requireTeamUser();
  await viewTask(projectId);
  const full = await prisma.project.findUnique({ where: { id: projectId } });
  if (!full) throw new Error("Task not found");

  const now = new Date();
  const updateData: Record<string, unknown> = {
    lastTeamUpdateAt: now,
  };
  if (!full.startAt) {
    updateData.startAt = now;
  }
  // If task was not in progress, move to In Progress
  if (full.editStatus === "Not Started" || full.briefStage === "Not Started") {
    updateData.editStatus = "In Progress";
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
    include: taskInclude,
  });

  later("work session started", async () => {
    await prisma.activity.create({
      data: {
        projectId,
        actorName: me.name,
        field: "Live Session",
        toValue: `Started work session at ${now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`,
      },
    });
    await onWorkSessionStarted(updated, me);
  });

  return {
    ok: true,
    startedAt: now.toISOString(),
    task: forViewer(toTaskDTO(updated), canSeeAll(me)),
  };
}

export async function stopWorkSession(input: {
  projectId: string;
  durationMinutes: number;
  workType?: string | null;
  notes?: string | null;
  markSubmitted?: boolean;
}): Promise<{ ok: boolean; entry: TimeEntryDTO; task: TaskDTO }> {
  const me = await requireTeamUser();
  const { p } = await viewTask(input.projectId);

  const entry = await addTimeEntry({
    projectId: input.projectId,
    durationMinutes: input.durationMinutes,
    workType: input.workType,
    notes: input.notes,
  });

  const updateData: Record<string, unknown> = {
    endAt: new Date(),
    lastTeamUpdateAt: new Date(),
  };
  if (input.markSubmitted) {
    updateData.editStatus = "Submitted";
  }

  const updated = await prisma.project.update({
    where: { id: input.projectId },
    data: updateData,
    include: taskInclude,
  });

  later("work session stopped", async () => {
    await onWorkSessionStopped(
      updated,
      me,
      input.durationMinutes,
      input.workType || updated.workType || "Assembly Edit",
      input.notes
    );
  });

  return {
    ok: true,
    entry,
    task: forViewer(toTaskDTO(updated), canSeeAll(me)),
  };
}

export async function getTimeEntries(projectId: string): Promise<TimeEntryDTO[]> {
  const { me } = await viewTask(projectId);
  const rows = await prisma.timeEntry.findMany({
    where: { projectId },
    include: { user: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  return rows.map((te) => ({
    id: te.id,
    projectId: te.projectId,
    userId: te.userId,
    userName: te.user.name,
    date: te.date.toISOString(),
    durationMinutes: te.durationMinutes,
    hours: Number((te.durationMinutes / 60).toFixed(1)),
    workType: te.workType,
    notes: te.notes,
    hourlyRate: te.hourlyRate,
    cost: Number(((te.durationMinutes / 60) * (te.hourlyRate || 0)).toFixed(2)),
    createdAt: te.createdAt.toISOString(),
  }));
}

export async function deleteTimeEntry(id: string) {
  const me = await requireTeamUser();
  const te = await prisma.timeEntry.findUnique({ where: { id } });
  if (!te) return;
  if (!canSeeAll(me) && te.userId !== me.id) throw new Error("Not allowed to delete someone else's time entry");
  await prisma.timeEntry.delete({ where: { id: te.id } });
}

export async function setUserHourlyRate(userId: string, rate: number) {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can set hourly rates");
  await prisma.user.update({ where: { id: userId }, data: { hourlyRate: Math.max(0, rate) } });
  revalidatePath("/team");
}

// ---------- Brand Details ----------
export async function updateBrandDetails(
  brandId: string,
  patch: {
    name?: string;
    pocName?: string | null;
    pocEmail?: string | null;
    color?: string;
    repositoryUrl?: string | null;
    guidelines?: string | null;
  },
) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Only managers and admins can edit brand details");
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
  if (patch.pocName !== undefined) data.pocName = patch.pocName?.trim() || null;
  if (patch.pocEmail !== undefined) data.pocEmail = patch.pocEmail?.trim() || null;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.repositoryUrl !== undefined) data.repositoryUrl = patch.repositoryUrl?.trim() || null;
  if (patch.guidelines !== undefined) data.guidelines = patch.guidelines?.trim() || null;
  const brand = await prisma.brand.update({ where: { id: brandId }, data });
  revalidatePath("/brands");
  return brand;
}

// ---------- Timeline Revision Request ----------
export async function requestDeadlineExtension(
  projectId: string,
  newDate: string,
  reason: string
) {
  const me = await requireTeamUser();
  await viewTask(projectId);

  const fullProject = await prisma.project.findUnique({
    where: { id: projectId },
    include: taskInclude,
  });
  if (!fullProject) throw new Error("Task not found");

  const note = `⚠️ TIMELINE REVISION SUBMITTED by ${me.name}:
• Proposed Deadline: ${newDate}
• Reason / Justification: ${reason.trim()}`;

  // 1. Post to update thread
  await addUpdate(projectId, note);

  // 2. Increment intDeadlineChanges and append note
  const updatedNotes = fullProject.notes
    ? `${fullProject.notes}\n[Extension Request by ${me.name}]: ${newDate} - ${reason.trim()}`
    : `[Extension Request by ${me.name}]: ${newDate} - ${reason.trim()}`;

  const parseDate = newDate ? new Date(newDate) : null;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      intDeadlineChanges: { increment: 1 },
      notes: updatedNotes,
      internalDeadline: parseDate && !isNaN(parseDate.getTime()) ? parseDate : undefined,
    },
  });

  // 3. Notify Assigner & Managers
  await onTimelineRevised(fullProject, me.name, newDate, reason);

  revalidatePath("/projects");
  revalidatePath("/my-tasks");
  return { ok: true };
}
