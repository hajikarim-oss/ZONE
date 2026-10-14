"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeamUser } from "@/lib/auth";
import { canCreateProjects, canEditField, canManageBrands, canManageTeam, canSeeAll, canViewProject, isAdmin } from "@/lib/rbac";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPARTMENTS, DEPTS, EDIT_STATUSES, FINAL_APPROVAL,
  PREPRO_STAGES, PRIORITIES, REVISION_ALERT_ROUND, ROLES, SCRIPT_STAGES, SHOOT_STATUSES,
} from "@/lib/constants";
import { forViewer, taskInclude, toTaskDTO, type TaskDTO } from "@/lib/dto";
import { onAssigned, onClosed, onFinalApproved, onFirstCutSent, onRevisionAlert } from "@/lib/notify";
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
const DATES = new Set(["externalDeadline", "internalDeadline"]);
const REFS = new Set(["brandId", "assigneeId"]);

const FIELD_LABEL: Record<string, string> = {
  title: "Title", type: "Type", platform: "Platform", dept: "Dept", priority: "Priority",
  briefStage: "Brief", scriptStage: "Concept / script", preProStage: "Pre-pro", shootStatus: "Shoot",
  editStatus: "Edit status", revisionRound: "Revision round", clientReview: "Client review",
  finalApproval: "Final approval", deliveryStatus: "Delivery", notes: "Notes", context: "Context",
  externalDeadline: "External deadline", internalDeadline: "Internal deadline", brandId: "Brand", assigneeId: "Assignee",
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
  throw new Error(`Unknown field ${field}`);
}

function show(v: unknown, field: string) {
  if (v == null || v === "") return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 200) + (field === "notes" && String(v).length > 200 ? "…" : "");
}

// Inline edit from any view (list cell, board card, side panel).
export async function updateTask(id: string, patch: Record<string, unknown>): Promise<TaskDTO> {
  const me = await requireTeamUser();
  const before = await prisma.project.findUnique({ where: { id }, include: taskInclude });
  if (!before) throw new Error("Task not found");
  if (!canViewProject(me, before.assigneeId)) throw new Error("Not allowed");

  const data: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(patch)) {
    if (!canEditField(me, field, before.assigneeId)) throw new Error(`You can't change ${FIELD_LABEL[field] ?? field}`);
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

  const changes = Object.keys(patch).filter((f) => show((before as any)[f], f) !== show((after as any)[f], f));
  if (changes.length) {
    const names = async (f: string, v: unknown) => {
      if (f === "brandId" && v) return (await prisma.brand.findUnique({ where: { id: String(v) } }))?.name ?? "—";
      if (f === "assigneeId" && v) return (await prisma.user.findUnique({ where: { id: String(v) } }))?.name ?? "—";
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

  revalidatePath("/", "layout");
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
  internalDeadline?: string | null;
  externalDeadline?: string | null;
  priority?: string;
  type?: string | null;
  platform?: string | null;
}): Promise<TaskDTO> {
  const me = await requireTeamUser();
  if (!canCreateProjects(me)) throw new Error("Only admins and managers can add tasks");
  const title = input.title?.trim();
  if (!title) throw new Error("Give the task a name");
  const p = await prisma.project.create({
    data: {
      code: await nextCode(),
      title,
      brandId: input.brandId || null,
      assigneeId: input.assigneeId || null,
      priority: input.priority && PRIORITIES.includes(input.priority as any) ? input.priority : "Medium",
      type: input.type || null,
      platform: input.platform || null,
      internalDeadline: input.internalDeadline ? new Date(input.internalDeadline) : null,
      externalDeadline: input.externalDeadline ? new Date(input.externalDeadline) : null,
      lastTeamUpdateAt: new Date(),
    },
    include: taskInclude,
  });
  await prisma.activity.create({ data: { projectId: p.id, actorName: me.name, field: "Created", toValue: p.title } });
  if (p.assigneeId && p.assigneeId !== me.id) await onAssigned(p);
  revalidatePath("/", "layout");
  return toTaskDTO(p);
}

export async function setArchived(id: string, archived: boolean) {
  const me = await requireTeamUser();
  if (!canSeeAll(me)) throw new Error("Not allowed");
  await prisma.project.update({ where: { id }, data: { archived } });
  await prisma.activity.create({ data: { projectId: id, actorName: me.name, field: archived ? "Moved to Completed" : "Moved back to active" } });
  revalidatePath("/", "layout");
}

export async function deleteTask(id: string) {
  const me = await requireTeamUser();
  if (!isAdmin(me)) throw new Error("Only admins can delete tasks");
  await prisma.project.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export type UpdateDTO = { id: string; authorName: string; body: string; createdAt: string };
export type ActivityDTO = { id: string; actorName: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string };

export async function getTaskThread(id: string): Promise<{ updates: UpdateDTO[]; activity: ActivityDTO[] }> {
  const me = await requireTeamUser();
  const p = await prisma.project.findUnique({ where: { id }, select: { assigneeId: true } });
  if (!p || !canViewProject(me, p.assigneeId)) throw new Error("Not allowed");
  const [updates, activity] = await Promise.all([
    prisma.update.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    prisma.activity.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    updates: updates.map((u) => ({ id: u.id, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() })),
    // Team members don't see client-deadline changes in the history either
    activity: activity
      .filter((a) => canSeeAll(me) || a.field !== "External deadline")
      .map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}

export async function addUpdate(projectId: string, body: string): Promise<UpdateDTO> {
  const me = await requireTeamUser();
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { assigneeId: true } });
  if (!p || !canViewProject(me, p.assigneeId)) throw new Error("Not allowed");
  const text = body.trim();
  if (!text) throw new Error("Write something first");
  const u = await prisma.update.create({ data: { projectId, authorId: me.id, authorName: me.name, body: text } });
  if (p.assigneeId === me.id) {
    await prisma.project.update({ where: { id: projectId }, data: { lastTeamUpdateAt: new Date(), reminderCount: 0 } });
  }
  revalidatePath("/", "layout");
  return { id: u.id, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() };
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
