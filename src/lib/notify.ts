import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { fmtDate } from "@/lib/utils";
import type { Brand, Project, User } from "@prisma/client";

type P = Project & { brand: Brand | null; assignee: User | null };

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
export async function onAssigned(p: P) {
  if (!p.assignee || !p.assignee.active) return;
  await notify(p.assignee.id, `New task: ${p.title}`, `${p.brand?.name ?? "No brand"} · ${p.code}`, `/my-tasks?task=${p.id}`);
  await sendMail(
    p.assignee.email,
    `📌 New task assigned — ${p.title}`,
    emailHtml({
      heading: `${p.title} is on your plate`,
      intro: `Hi ${p.assignee.name.split(" ")[0]}, a new task has been assigned to you.${p.context ? `\n\nContext: ${p.context}` : ""}`,
      head: ["Field", "Value"],
      rows: [
        ["Task", `${p.code} · ${p.title}`],
        ["Brand", p.brand?.name ?? "—"],
        ["Type / platform", [p.type, p.platform].filter(Boolean).join(" · ") || "—"],
        ["Priority", p.priority],
        ["Your deadline", fmtDate(p.internalDeadline, true) || "—"],
      ],
      cta: { label: "Open task", href: `${APP_URL}/my-tasks?task=${p.id}` },
    }),
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
