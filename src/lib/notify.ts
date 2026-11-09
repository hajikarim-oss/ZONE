import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { fmtDate } from "@/lib/utils";
import type { Brand, Project, User } from "@prisma/client";

type P = Project & {
  brand: Brand | null;
  assignee: User | null;
  campaign?: { name: string } | null;
  createdBy?: { name: string } | null;
};

// In-app notification (Inbox) + optional email copy.
export async function notify(userId: string, title: string, body?: string, href?: string) {
  await prisma.notification.create({ data: { userId, title, body, href } });
}

export async function adminUsers() {
  return prisma.user.findMany({ where: { role: "ADMIN", active: true } });
}

function link(p: Project) {
  return `${APP_URL}/projects?task=${p.id}`;
}

// Assigned To changed → "new project assigned to you" with the brief details.
export async function onAssigned(p: P, assigner?: { id: string; name: string; email?: string } | null) {
  if (!p.assignee || !p.assignee.active) return;
  const assignerName = assigner?.name || p.createdBy?.name || "Production Manager";
  const assignerId = assigner?.id || p.createdById;

  // 1. Alert Assignee
  await notify(
    p.assignee.id,
    `📌 New task assigned: ${p.title}`,
    `${p.brand?.name ?? "No brand"} · Assigned by ${assignerName} · Due: ${fmtDate(p.internalDeadline, true) || "No deadline set"}`,
    `/my-tasks?task=${p.id}`
  );
  await sendMail(
    p.assignee.email,
    `📌 New task assigned — ${p.title}`,
    emailHtml({
      heading: `${p.title} is assigned to you`,
      intro: `Hi ${p.assignee.name.split(" ")[0]}, ${assignerName} has assigned a new deliverable to you.${p.context ? `\n\nContext / Brief: ${p.context}` : ""}`,
      head: ["Field", "Value"],
      rows: [
        ["Task", `${p.code} · ${p.title}`],
        ["Brand", p.brand?.name ?? "—"],
        ["Campaign", p.campaign?.name ?? "—"],
        ["Assigned By", assignerName],
        ["Type / platform", [p.type, p.platform].filter(Boolean).join(" · ") || "—"],
        ["Priority", p.priority],
        ["Production Due Date", fmtDate(p.internalDeadline, true) || "—"],
      ],
      cta: { label: "Accept & Start Working", href: `${APP_URL}/my-tasks?task=${p.id}` },
    }),
  );

  // 2. Alert Assigner (Confirmation on Dashboard + Email)
  if (assignerId && assignerId !== p.assigneeId) {
    await notify(
      assignerId,
      `✅ Assignment confirmed: ${p.title}`,
      `Assigned to ${p.assignee.name} · Tracking enabled · Due: ${fmtDate(p.internalDeadline, true) || "No deadline set"}`,
      `/projects?task=${p.id}`
    );
    const assignerUser = assigner?.email
      ? assigner
      : await prisma.user.findUnique({ where: { id: assignerId }, select: { id: true, name: true, email: true } });
    if (assignerUser?.email) {
      await sendMail(
        assignerUser.email,
        `✅ Assignment confirmed — ${p.title} (${p.assignee.name})`,
        emailHtml({
          heading: `Assignment confirmed: ${p.title}`,
          intro: `You have assigned "${p.title}" to ${p.assignee.name}. You will receive progress reports as they start and log work hours.`,
          head: ["Field", "Value"],
          rows: [
            ["Deliverable", `${p.code} · ${p.title}`],
            ["Assignee", p.assignee.name],
            ["Brand & Campaign", `${p.brand?.name ?? "—"} · ${p.campaign?.name ?? "—"}`],
            ["Priority", p.priority],
            ["Due Date", fmtDate(p.internalDeadline, true) || "—"],
          ],
          cta: { label: "View Task on Dashboard", href: `${APP_URL}/projects?task=${p.id}` },
        }),
      );
    }
  }
}

// Live session started → Notify assigner and assignee
export async function onWorkSessionStarted(p: P, worker: { id: string; name: string }) {
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  if (p.createdById && p.createdById !== worker.id) {
    await notify(
      p.createdById,
      `🚀 ${worker.name} started working on ${p.title}`,
      `Work in progress · Started at ${timeStr}.`,
      `/projects?task=${p.id}`
    );
  }
  await notify(
    worker.id,
    `⏱ Work session active: ${p.title}`,
    `Timer running since ${timeStr}. Remember to stop & log progress when pausing or finishing.`,
    `/my-tasks?task=${p.id}`
  );
}

// Work session stopped & logged → Send full progress report to assigner & assignee
export async function onWorkSessionStopped(
  p: P,
  worker: { id: string; name: string },
  durationMinutes: number,
  workType: string,
  notes?: string | null
) {
  const hrs = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  if (p.createdById && p.createdById !== worker.id) {
    await notify(
      p.createdById,
      `📊 Progress Report: ${worker.name} logged ${durStr} on ${p.title}`,
      `${workType} · Note: ${notes || "No notes"}`,
      `/projects?task=${p.id}`
    );
    const creator = await prisma.user.findUnique({ where: { id: p.createdById }, select: { email: true } });
    if (creator?.email) {
      await sendMail(
        creator.email,
        `📊 Work Progress Report — ${p.title} (${worker.name} logged ${durStr})`,
        emailHtml({
          heading: `Progress Report: ${p.title}`,
          intro: `${worker.name} has logged a work session of ${durStr} on "${p.title}".`,
          head: ["Field", "Detail"],
          rows: [
            ["Deliverable", `${p.code} · ${p.title}`],
            ["Editor / Assignee", worker.name],
            ["Duration Tracked", durStr],
            ["Work Type", workType || "Assembly Edit"],
            ["Progress Notes", notes || "Progress logged"],
            ["Status", p.editStatus],
          ],
          cta: { label: "Review Deliverable", href: `${APP_URL}/projects?task=${p.id}` },
        }),
      );
    }
  }

  await notify(
    worker.id,
    `✅ Work session logged: ${durStr}`,
    `Successfully logged to ${p.title} (${workType}).`,
    `/my-tasks?task=${p.id}`
  );
}

// Edit status → First Cut Sent: tell the brand their video is ready for review.
export async function onFirstCutSent(p: P) {
  if (!p.brandId) return;
  // The registry "POC" is usually TBM's own account person, so they get an
  // internal heads-up; the client-facing email goes to the brand's client logins.
  if (p.brand?.pocEmail) {
    const poc = await prisma.user.findUnique({ where: { email: p.brand.pocEmail } });
    if (poc) await notify(poc.id, `First cut sent: ${p.title}`, `${p.brand.name} · ${p.assignee?.name ?? ""}`, `/projects?task=${p.id}`);
  }
  const clients = await prisma.client.findMany({ where: { brandId: p.brandId } });
  const to = [...new Set<string>(clients.map((c) => c.email))];
  if (!to.length) return;
  await sendMail(
    to,
    `🎬 ${p.title} is ready for your review`,
    emailHtml({
      heading: "Your first cut is ready",
      intro: `The first cut of "${p.title}" has been shared with you for review. Once you've had a look, please send your feedback to your TBM point of contact.`,
      cta: { label: "View in your tracker", href: `${APP_URL}/portal` },
      footer: "The Bored Monkey Studio",
    }),
  );
}

export async function onRevisionAlert(p: P) {
  const admins = await adminUsers();
  for (const a of admins) await notify(a.id, `Revision round ${p.revisionRound}: ${p.title}`, `${p.brand?.name ?? ""} · ${p.assignee?.name ?? "Unassigned"}`, `/projects?task=${p.id}`);
  await sendMail(
    admins.map((a) => a.email),
    `🔄 ${p.title} has hit revision round ${p.revisionRound}`,
    emailHtml({
      heading: `Round ${p.revisionRound} on ${p.title}`,
      intro: "This project is on its third revision or more, which usually means something in the brief or feedback loop needs a look.",
      rows: [["Brand", p.brand?.name ?? "—"], ["Assigned to", p.assignee?.name ?? "—"], ["Edit status", p.editStatus]],
      cta: { label: "Open task", href: link(p) },
    }),
  );
}

export async function onFinalApproved(p: P) {
  const admins = await adminUsers();
  for (const a of admins) await notify(a.id, `Approved: ${p.title}`, "Ready to deliver final files", `/projects?task=${p.id}`);
}

export async function onClosed(p: P) {
  const admins = await adminUsers();
  const ids = new Set<string>(admins.map((a) => a.id));
  if (p.assignee) ids.add(p.assignee.id);
  for (const id of ids) {
    const href = admins.some((a) => a.id === id) ? `/projects?task=${p.id}` : `/my-tasks?task=${p.id}`;
    await notify(id, `🎉 Closed: ${p.title}`, p.brand?.name ?? undefined, href);
  }
}

// Founders list: Suraj, Pratik, Sachin, Uday
export const FOUNDER_EMAILS = [
  "suraj@theboredmonkey.com",
  "pratik@theboredmonkey.com",
  "sachin@theboredmonkey.com",
  "uday@theboredmonkey.com",
];

export async function founderUsers() {
  return prisma.user.findMany({
    where: {
      email: { in: FOUNDER_EMAILS },
      active: true,
    },
  });
}

// Alert Founders when a deliverable is 24h+ overdue without response/revision
export async function alertFoundersOverdue(task: {
  id: string;
  title: string;
  code: string;
  brandName?: string;
  assigneeName?: string;
  overdueHours: number;
}) {
  const founders = await founderUsers();
  const founderEmails = founders.map((f) => f.email);
  const subject = `🚨 FOUNDER CRITICAL ALERT: ${task.code} is ${task.overdueHours}h overdue without response`;
  const intro = `Deliverable "${task.title}" assigned to ${task.assigneeName || "an editor"} is critically overdue by ${task.overdueHours} hours without an updated timeline or status. Management intervention required immediately.`;

  for (const f of founders) {
    await notify(
      f.id,
      `🚨 FOUNDER ALERT: ${task.code} (${task.overdueHours}h overdue)`,
      `${task.title} · ${task.assigneeName || "Unassigned"} has not responded.`,
      `/projects?task=${task.id}`
    );
  }

  await sendMail(
    founderEmails,
    subject,
    emailHtml({
      heading: "🚨 Executive Studio Escalation",
      intro,
      head: ["Deliverable", "Brand", "Assignee", "Overdue Status"],
      rows: [
        [`${task.code} · ${task.title}`, task.brandName || "—", task.assigneeName || "—", `${task.overdueHours} hrs past deadline`],
      ],
      cta: {
        label: "Intervene & Reassign in Dashboard",
        href: `${APP_URL}/projects?task=${task.id}`,
      },
      footer: "This alert is triggered automatically when a deliverable is 24h+ overdue without assignee communication.",
    })
  );
}

// When assignee submits a revised timeline with a reason note, notify the assigner
export async function onTimelineRevised(p: P, revisedBy: string, newDate: string, reason: string) {
  const targetUserId = p.createdById && p.createdById !== p.assigneeId ? p.createdById : null;
  const targetUser = targetUserId ? await prisma.user.findUnique({ where: { id: targetUserId } }) : null;

  const noteBody = `New proposed date: ${newDate}\nReason: ${reason}`;
  const subject = `📅 Revised timeline submitted: ${p.title} (by ${revisedBy})`;

  if (targetUser) {
    await notify(
      targetUser.id,
      `Timeline revised: ${p.title}`,
      `New date: ${newDate} · ${reason}`,
      `/projects?task=${p.id}`
    );
    await sendMail(
      targetUser.email,
      subject,
      emailHtml({
        heading: `Timeline Revised for ${p.title}`,
        intro: `Hi ${targetUser.name.split(" ")[0]}, ${revisedBy} has submitted a revised delivery timeline for "${p.title}".`,
        head: ["Field", "Updated Value"],
        rows: [
          ["Deliverable", `${p.code} · ${p.title}`],
          ["Brand", p.brand?.name ?? "—"],
          ["New Proposed Deadline", newDate],
          ["Reason / Note", reason],
        ],
        cta: { label: "Review & Track in Dashboard", href: `${APP_URL}/projects?task=${p.id}` },
        footer: "Please review if client expectations or air dates need to be adjusted.",
      })
    );
  } else {
    // Notify managers & admins
    const admins = await adminUsers();
    for (const a of admins) {
      await notify(a.id, `Timeline revised: ${p.title}`, `New date: ${newDate} · ${reason}`, `/projects?task=${p.id}`);
    }
  }
}
