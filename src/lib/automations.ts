import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { adminUsers, notify } from "@/lib/notify";
import { taskInclude, toTaskDTO } from "@/lib/dto";
import { computeDelay, computeStage, daysBetween, isDone, startOfToday, waitingOn } from "@/lib/status";
import {
  ARCHIVE_AFTER_DAYS, BRAND_NUDGE_DAYS, DEADLINE_ALERT_DAYS, ESCALATE_AFTER, STALE_DAYS,
} from "@/lib/constants";
import { fmtDate } from "@/lib/utils";

// Daily automations. Replaces the Apps Script time triggers:
//  1. Stale-task reminders that escalate (day 1 nudge → day 2 warning →
//     day 3+ admins CC'd), and stop as soon as the person updates.
//  2. Deadline heads-up 3 days before the team deadline.
//  3. Brand nudge when a cut has sat with the brand for 2+ days.
//  4. Auto-archive projects closed 30+ days ago.
//  5. Monday weekly report to admins.
// Runs from /api/cron/daily (Vercel Cron, 8:00 AM IST) or the "Run now"
// button on the Automations page.

export type DailyResult = { reminders: number; escalated: number; deadlineAlerts: number; brandNudges: number; archived: number; weekly: boolean };

// opts.weekly forces the Monday report (used by "Run now" so it can be tested any day)
export async function runDailyAutomations(source: string, opts: { weekly?: boolean } = {}): Promise<DailyResult> {

  const now = new Date();
  const today = startOfToday(now);
  const admins = await adminUsers();
  const adminEmails = admins.map((a) => a.email);
  const result: DailyResult = { reminders: 0, escalated: 0, deadlineAlerts: 0, brandNudges: 0, archived: 0, weekly: false };

  const projects = await prisma.project.findMany({ where: { archived: false }, include: taskInclude });
  // On-hold tasks are paused: no reminders, deadline alerts or brand nudges.
  const active = projects.filter((p) => !isDone(p) && !p.onHold);

  // ── 1. Stale reminders ──
  const staleCutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000);
  const byPerson = new Map<string, typeof active>();
  for (const p of active) {
    if (!p.assignee || !p.assignee.active) continue;
    if (waitingOn(p) === "BRAND") continue; // ball is with the brand, not them
    const last = p.lastTeamUpdateAt ?? p.updatedAt;
    if (last > staleCutoff) continue;
    byPerson.set(p.assignee.id, [...(byPerson.get(p.assignee.id) ?? []), p]);
  }
  for (const [, list] of byPerson) {
    const person = list[0].assignee!;
    await prisma.project.updateMany({ where: { id: { in: list.map((p) => p.id) } }, data: { reminderCount: { increment: 1 } } });
    const level = Math.max(...list.map((p) => p.reminderCount + 1));
    const escalate = level >= ESCALATE_AFTER;
    const subject =
      level === 1
        ? `🔔 ${list.length} task${list.length > 1 ? "s" : ""} waiting for your update`
        : escalate
          ? `🚨 Reminder #${level}: admins have been notified`
          : `⚠️ Reminder #${level}: still need your update`;
    const sorted = [...list].sort((a, b) => {
      const pr = { High: 0, Medium: 1, Low: 2 } as Record<string, number>;
      return (pr[a.priority] ?? 1) - (pr[b.priority] ?? 1) || (a.internalDeadline?.getTime() ?? 9e15) - (b.internalDeadline?.getTime() ?? 9e15);
    });
    await sendMail(
      person.email,
      subject,
      emailHtml({
        heading: `Hi ${person.name.split(" ")[0]}, a quick status check`,
        intro:
          `These haven't been updated in ${STALE_DAYS}+ day${STALE_DAYS > 1 ? "s" : ""}. Change the status or post a note on each and the reminders stop.` +
          (level === ESCALATE_AFTER - 1 ? "\n\nIf there's no update by tomorrow, admins will be copied in." : ""),
        head: ["Task", "Brand", "Stage", "Your deadline"],
        rows: sorted.map((p) => [p.title, p.brand?.name ?? "—", computeStage(p).label, fmtDate(p.internalDeadline) || "—"]),
        cta: { label: "Update my tasks", href: `${APP_URL}/my-tasks` },
      }),
      escalate ? adminEmails : undefined,
    );
    await notify(person.id, subject, undefined, "/my-tasks");
    result.reminders++;
    if (escalate) result.escalated++;
  }

  // ── 2. Deadline heads-up ──
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + DEADLINE_ALERT_DAYS);
  const dueSoon = active.filter((p) => p.assignee?.active && p.internalDeadline && p.internalDeadline >= today && p.internalDeadline <= horizon);
  const dueByPerson = new Map<string, typeof dueSoon>();
  for (const p of dueSoon) dueByPerson.set(p.assigneeId!, [...(dueByPerson.get(p.assigneeId!) ?? []), p]);
  for (const [, list] of dueByPerson) {
    const person = list[0].assignee!;
    await sendMail(
      person.email,
      `⏰ ${list.length} deadline${list.length > 1 ? "s" : ""} in the next ${DEADLINE_ALERT_DAYS} days`,
      emailHtml({
        heading: "Coming up",
        head: ["Task", "Brand", "Stage", "Due"],
        rows: list.map((p) => [p.title, p.brand?.name ?? "—", computeStage(p).label, `${fmtDate(p.internalDeadline)} (${daysBetween(today, p.internalDeadline!) === 0 ? "today" : `in ${daysBetween(today, p.internalDeadline!)}d`})`]),
        cta: { label: "Open my tasks", href: `${APP_URL}/my-tasks` },
      }),
    );
    result.deadlineAlerts++;
  }

  // ── 3. Brand nudge ──
  for (const p of active) {
    if (!(p.editStatus === "First Cut Sent" || p.editStatus === "In Review")) continue;
    const days = daysBetween(p.statusChangedAt, today);
    if (days < BRAND_NUDGE_DAYS || days % BRAND_NUDGE_DAYS !== 0) continue;
    const clients = p.brandId ? await prisma.client.findMany({ where: { brandId: p.brandId } }) : [];
    const to = [...new Set<string>(clients.map((c) => c.email))]; // client logins only
    if (!to.length) continue;
    await sendMail(
      to,
      `👀 Waiting for your feedback: ${p.title}`,
      emailHtml({
        heading: "A gentle nudge",
        intro: `"${p.title}" has been with you for review for ${days} days. Whenever you get a chance, please share your feedback with your TBM point of contact so we can keep things moving.`,
        cta: { label: "Open your tracker", href: `${APP_URL}/portal` },
        footer: "The Bored Monkey Studio",
      }),
    );
    result.brandNudges++;
  }

  // ── 4. Auto-archive ──
  const archiveBefore = new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 86_400_000);
  const arch = await prisma.project.updateMany({
    where: { archived: false, deliveryStatus: "Project Closed", closedAt: { lt: archiveBefore } },
    data: { archived: true },
  });
  result.archived = arch.count;

  // ── 5. Monday weekly report ──
  const istDay = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
  if ((istDay === 1 || opts.weekly) && adminEmails.length) {
    const dtos = projects.map(toTaskDTO);
    const act = dtos.filter((t) => !isDone(t));
    const delays = act.map((t) => ({ t, d: computeDelay(t) })).filter((x) => x.d);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const deliveredThisWeek = projects.filter((p) => isDone(p) && p.updatedAt > weekAgo);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const dueThisWeek = act.filter((t) => t.internalDeadline && new Date(t.internalDeadline) <= weekEnd && new Date(t.internalDeadline) >= today);
    await sendMail(
      adminEmails,
      `📊 Weekly post-production report — ${act.length} active, ${delays.length} late`,
      emailHtml({
        heading: "Your week in post-production",
        intro: `Active: ${act.length}\nLate (team): ${delays.filter((x) => x.d!.who === "EDITOR").length}\nWaiting on brand: ${delays.filter((x) => x.d!.who === "BRAND").length}\nDelivered in the last 7 days: ${deliveredThisWeek.length}\nDue this week: ${dueThisWeek.length}`,
        head: ["Late project", "Brand", "Assignee", "Who", "Days"],
        rows: delays
          .sort((a, b) => b.d!.days - a.d!.days)
          .slice(0, 20)
          .map(({ t, d }) => [t.title, t.brandName ?? "—", t.assigneeName ?? "Unassigned", d!.who === "EDITOR" ? "Team" : "Brand", String(d!.days)]),
        cta: { label: "Open dashboard", href: `${APP_URL}/home` },
      }),
    );
    result.weekly = true;
  }

  await prisma.automationRun.create({ data: { source, result: JSON.stringify(result) } });
  return result;
}
