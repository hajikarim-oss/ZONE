"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamUser } from "@/lib/auth";
import { canCreateProjects, canEditField, canManageBrands, canManageCollaborators, canManageTeam, canSeeAll, canViewProject, isAdmin, type Access } from "@/lib/rbac";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPARTMENTS, DEPTS, EDIT_STATUSES, FINAL_APPROVAL,
  PREPRO_STAGES, PRIORITIES, REVISION_ALERT_ROUND, ROLES, SCRIPT_STAGES, SHOOT_STATUSES,
} from "@/lib/constants";
import { forViewer, taskInclude, toAttachmentDTO, toTaskDTO, type AttachmentDTO, type TaskDTO } from "@/lib/dto";
import { notify, onAssigned, onClosed, onFinalApproved, onFirstCutSent, onRevisionAlert } from "@/lib/notify";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { runDailyAutomations, type DailyResult } from "@/lib/automations";

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
const TEXT = new Set(["title", "type", "platform", "notes", "context"]);
const DATES = new Set(["externalDeadline", "internalDeadline", "startDate"]);
const REFS = new Set(["brandId", "assigneeId", "storageDeviceId"]);
const BOOLS = new Set(["onHold"]);
const NUMS = new Set(["estimatedHours"]);

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
function access(p: { assigneeId: string | null; createdById: string | null; collaborators: { id: string }[]; brandId?: string | null }): Access {
  return { assigneeId: p.assigneeId, createdById: p.createdById, collaboratorIds: p.collaborators.map((c) => c.id), brandId: p.brandId };
}

// Link to a task for a given person (team members open it from My tasks).
function taskHref(role: string, id: string) {
  return role === "ADMIN" || role === "MANAGER" ? `/projects?task=${id}` : `/my-tasks?task=${id}`;
}

const FIELD_LABEL: Record<string, string> = {
  title: "Title", type: "Type", platform: "Platform", dept: "Dept", priority: "Priority",
  briefStage: "Brief", scriptStage: "Concept / script", preProStage: "Pre-pro", shootStatus: "Shoot",
  editStatus: "Edit status", revisionRound: "Revision round", clientReview: "Client review",
  finalApproval: "Final approval", deliveryStatus: "Delivery", notes: "Notes", context: "Context",
  startDate: "Start date", externalDeadline: "Due date", internalDeadline: "End date",
  brandId: "Brand", assigneeId: "Assignee", storageDeviceId: "Storage",
  onHold: "On hold", estimatedHours: "Estimated hours",
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
  if (NUMS.has(field)) {
    if (!raw && raw !== 0) return null;
    const n = Number(raw);
    if (isNaN(n) || n < 0) throw new Error(`Invalid value for ${FIELD_LABEL[field]}`);
    return n;
  }
  throw new Error(`Unknown field ${field}`);
}

function show(v: unknown, field: string) {
  if (v == null || v === "") return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
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
    // If moving to In Progress or Revision, take off hold and uncomplete so board syncs
    if (data.editStatus === "In Progress" || data.editStatus.includes("Revision")) {
      if (before.onHold && data.onHold === undefined) data.onHold = false;
      if (
        (before.deliveryStatus === "Files Sent" || before.deliveryStatus === "Project Closed" || before.deliveryStatus === "Invoice Raised") &&
        data.deliveryStatus === undefined
      ) {
        data.deliveryStatus = "Not Started";
        data.closedAt = null;
      }
    }
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

  const changes = Object.keys(patch).filter((f) => show((before as any)[f], f) !== show((after as any)[f], f));
  later("task history + automations", async () => {
  if (changes.length) {
    const names = async (f: string, v: unknown) => {
      if (f === "brandId" && v) return (await prisma.brand.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "assigneeId" && v) return (await prisma.user.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "storageDeviceId" && v) return (await prisma.storageDevice.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      return show(v, f);
    };
    await prisma.activity.createMany({
      data: await Promise.all(
        changes.map(async (f) => ({
          projectId: id,
          actorName: me.name,
          field: FIELD_LABEL[f] ?? f,
          fromValue: await names(f, (before as any)[f]),
          toValue: await names(f, (after as any)[f]),
        })),
      ),
    });
  }

  // On-edit automations
  if (after.assigneeId && after.assigneeId !== before.assigneeId && after.assigneeId !== me.id) await onAssigned(after);
  if (after.editStatus === "First Cut Sent" && before.editStatus !== "First Cut Sent") await onFirstCutSent(after);
  if (after.revisionRound >= REVISION_ALERT_ROUND && before.revisionRound < REVISION_ALERT_ROUND) await onRevisionAlert(after);
  if (after.finalApproval === "Approved" && before.finalApproval !== "Approved") await onFinalApproved(after);
  if (after.deliveryStatus === "Project Closed" && before.deliveryStatus !== "Project Closed") await onClosed(after);
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
  assigneeId?: string | null;
  startDate?: string | null;
  internalDeadline?: string | null;
  externalDeadline?: string | null;
  priority?: string;
  type?: string | null;
  platform?: string | null;
  collaboratorIds?: string[];
  parentId?: string | null;
}): Promise<TaskDTO> {
  const me = await requireTeamUser();
  if (!canCreateProjects(me)) throw new Error("You can't add tasks");
  const title = input.title?.trim();
  if (!title) throw new Error("Give the task a name");
  const seeAll = canSeeAll(me);
  const collabIds = [...new Set((input.collaboratorIds ?? []).filter(Boolean))];
  const p = await prisma.project.create({
    data: {
      code: await nextCode(),
      title,
      brandId: input.brandId || null,
      // Assigned to chosen teammate, or defaults to creator (or null for admins/managers)
      assigneeId: input.assigneeId || (seeAll ? null : me.id),
      createdById: me.id,
      collaborators: collabIds.length ? { connect: collabIds.map((id) => ({ id })) } : undefined,
      priority: input.priority && PRIORITIES.includes(input.priority as any) ? input.priority : "Medium",
      type: input.type || null,
      platform: input.platform || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      internalDeadline: input.internalDeadline ? new Date(input.internalDeadline) : null,
      externalDeadline: seeAll && input.externalDeadline ? new Date(input.externalDeadline) : null,
      parentId: input.parentId || null,
      lastTeamUpdateAt: new Date(),
    },
    include: taskInclude,
  });
  later("new task notifications", async () => {
    await prisma.activity.create({ data: { projectId: p.id, actorName: me.name, field: "Created", toValue: p.title } });
    if (p.assigneeId && p.assigneeId !== me.id) await onAssigned(p);
    for (const c of p.collaborators) {
      if (c.id === me.id || c.id === p.assigneeId) continue;
      const u = await prisma.user.findUnique({ where: { id: c.id } });
      if (u) await notify(u.id, `${me.name} added you to ${p.title}`, "You're a collaborator on this task", taskHref(u.role, p.id));
    }
  });
  return forViewer(toTaskDTO(p), seeAll);
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
  if (!canSeeAll(me)) throw new Error("Not allowed");
  await prisma.project.update({ where: { id }, data: { archived } });
  later("archive history", () =>
    prisma.activity.create({ data: { projectId: id, actorName: me.name, field: archived ? "Moved to Completed" : "Moved back to active" } }),
  );
}

export async function deleteTask(id: string) {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can delete tasks");
  await prisma.project.delete({ where: { id } });
}

export type UpdateDTO = { id: string; authorId: string | null; authorName: string; body: string; createdAt: string };
export type ActivityDTO = { id: string; actorName: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string };

export async function getTaskThread(id: string): Promise<{ updates: UpdateDTO[]; activity: ActivityDTO[] }> {
  const [me, p, updates, activity] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id }, select: { assigneeId: true, createdById: true, collaborators: { select: { id: true } } } }),
    prisma.update.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    prisma.activity.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  return {
    updates: updates.map((u) => ({ id: u.id, authorId: u.authorId, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() })),
    // Team members don't see client-deadline changes in the history either
    activity: activity
      .filter((a) => canSeeAll(me) || a.field !== "Due date")
      .map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}

export async function getSubtasks(parentId: string): Promise<TaskDTO[]> {
  const me = await requireTeamUser();
  const rows = await prisma.project.findMany({
    where: { parentId },
    include: taskInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => forViewer(toTaskDTO(r), canSeeAll(me)));
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
    if (f) await notify(f.id, `${me.name} commented on ${p.title}`, snippet, taskHref(f.role, p.id));
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

// ───────────────────────── Attachments ─────────────────────────

export async function getAttachments(projectId: string): Promise<AttachmentDTO[]> {
  const [me, p] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id: projectId }, select: { assigneeId: true, createdById: true, collaborators: { select: { id: true } } } }),
  ]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  const rows = await prisma.attachment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(toAttachmentDTO);
}

export async function addAttachment(projectId: string, url: string, label?: string): Promise<AttachmentDTO> {
  const trimUrl = url.trim();
  if (!trimUrl) throw new Error("URL is required");
  const [me, p] = await Promise.all([
    requireTeamUser(),
    prisma.project.findUnique({ where: { id: projectId }, select: { assigneeId: true, createdById: true, collaborators: { select: { id: true } } } }),
  ]);
  if (!p || !canViewProject(me, access(p))) throw new Error("Not allowed");
  const a = await prisma.attachment.create({
    data: { projectId, addedById: me.id, url: trimUrl, label: label?.trim() || null },
  });
  later("attachment history", () =>
    prisma.activity.create({ data: { projectId, actorName: me.name, field: "Attachment", toValue: `Added: ${label?.trim() || trimUrl.slice(0, 60)}` } }),
  );
  return toAttachmentDTO(a);
}

export async function deleteAttachment(id: string) {
  const me = await requireTeamUser();
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return;
  // Can delete your own; admins/managers can delete any
  if (a.addedById !== me.id && !canSeeAll(me)) throw new Error("You can only remove your own attachments");
  await prisma.attachment.delete({ where: { id } });
}

// ───────────────────────── Storage Devices ─────────────────────────

export async function listStorageDevices(): Promise<{ id: string; name: string }[]> {
  await requireTeamUser();
  const devices = await prisma.storageDevice.findMany({ orderBy: { name: "asc" } });
  return devices.map((d) => ({ id: d.id, name: d.name }));
}

export async function createStorageDevice(name: string): Promise<{ id: string; name: string }> {
  const me = await requireTeamUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Storage device name is required");
  if (await prisma.storageDevice.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } }))
    throw new Error("A device with that name already exists");
  const d = await prisma.storageDevice.create({ data: { name: trimmed } });
  later("storage device created", () =>
    prisma.activity.create({ data: { projectId: "system", actorName: me.name, field: "Storage device", toValue: `Created: ${trimmed}` } }).catch(() => {}),
  );
  return { id: d.id, name: d.name };
}

export async function deleteStorageDevice(id: string) {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can remove storage devices");
  await prisma.storageDevice.delete({ where: { id } });
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

export async function updateTeamUser(id: string, patch: { role?: string; department?: string; active?: boolean; name?: string }) {
  const me = await requireTeamUser();
  if (!canManageTeam(me)) throw new Error("Only admins can change people");
  if (id === me.id && (patch.role && patch.role !== "ADMIN" || patch.active === false))
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

export async function createBrand(input: { name: string; pocName?: string; pocEmail?: string; color?: string }) {
  const me = await requireTeamUser();
  if (!canManageBrands(me)) throw new Error("Only admins can add brands");
  const name = input.name.trim();
  if (!name) return { error: "Brand name is required." };
  if (await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { error: "That brand already exists." };
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? input.color! : "#5b3fd1";
  await prisma.brand.create({
    data: { name, pocName: input.pocName?.trim() || null, pocEmail: input.pocEmail?.trim().toLowerCase() || null, color },
  });
  revalidatePath("/", "layout");
  return { ok: true };
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

// "Send test email" on the Automations page — goes to the admin clicking it.
export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can send test emails");
  if (!process.env.SMTP_HOST) return { ok: false, message: "SMTP_HOST is empty in .env. Fill in the SMTP lines and restart the app." };
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
