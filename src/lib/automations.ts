import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { adminUsers, alertFoundersOverdue, notify } from "@/lib/notify";
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
  const [admins, managers] = await Promise.all([
    adminUsers(),
    prisma.user.findMany({ where: { role: "MANAGER", active: true } }),
  ]);
  const adminEmails = admins.map((a) => a.email);
  const managerEmails = managers.map((m) => m.email);
  const result: DailyResult = { reminders: 0, escalated: 0, deadlineAlerts: 0, brandNudges: 0, archived: 0, weekly: false };

  const projects = await prisma.project.findMany({ where: { archived: false }, include: taskInclude });
  // On-hold tasks are paused: no reminders, deadline alerts or brand nudges.
  const active = projects.filter((p) => !isDone(p) && !p.onHold);

  // ── 1. Overdue deadline reminders (Editor -> Manager -> Admin escalation) ──
  // Feedback: "Reminders follow the deadline. If a video passes its internal deadline,
  // the editor or POC is reminded first. If it stays late, the manager is told next;
  // if still late, the admin is told. Admins are not copied on every small delay."
  const overdueTasks = active.filter((p) => {
    if (!p.assignee || !p.assignee.active) return false;
    if (waitingOn(p) === "BRAND") return false; // Ball is with the brand, not the editor
    const dl = p.internalDeadline ? startOfToday(p.internalDeadline) : null;
    return dl !== null && dl < today;
  });

  const byPerson = new Map<string, typeof active>();
  for (const p of overdueTasks) {
    byPerson.set(p.assignee!.id, [...(byPerson.get(p.assignee!.id) ?? []), p]);
  }

  for (const [, list] of byPerson) {
    const person = list[0].assignee!;
    await prisma.project.updateMany({ where: { id: { in: list.map((p) => p.id) } }, data: { reminderCount: { increment: 1 } } });
    const level = Math.max(...list.map((p) => p.reminderCount + 1));
    
    // Level 1: Editor / POC only
    // Level 2: Manager alerted next
    // Level 3+: Admin alerted
    let ccEmails: string[] | undefined = undefined;
    let subjectPrefix = "⏰ Overdue: ";
    if (level === 2 && managerEmails.length) {
      ccEmails = managerEmails;
      subjectPrefix = "⚠️ Overdue (Manager alerted): ";
      result.escalated++;
    } else if (level >= 3 && adminEmails.length) {
      ccEmails = [...new Set([...managerEmails, ...adminEmails])];
      subjectPrefix = `🚨 Critical delay #${level} (Admin alerted): `;
      result.escalated++;
    }

    const subject = `${subjectPrefix}${list.length} task${list.length > 1 ? "s" : ""} past due date`;
    const sorted = [...list].sort((a, b) => (a.internalDeadline?.getTime() ?? 0) - (b.internalDeadline?.getTime() ?? 0));

    await sendMail(
      person.email,
      subject,
      emailHtml({
        heading: `Hi ${person.name.split(" ")[0]}, deadline update required`,
        intro: level === 1
          ? "These deliverables have passed their internal due date. Please update their progress or complete them so the team stays on schedule."
          : level === 2
          ? "These deliverables remain overdue. Managers have been alerted to help resolve any blockers."
          : "These deliverables are critically delayed. Studio leadership has been notified.",
        head: ["Task", "Brand", "Campaign", "Stage", "Due Date"],
        rows: sorted.map((p) => [p.title, p.brand?.name ?? "—", p.campaign?.name ?? "—", computeStage(p).label, fmtDate(p.internalDeadline) || "—"]),
        cta: { label: "Update my tasks", href: `${APP_URL}/my-tasks` },
      }),
      ccEmails,
    );
    await notify(person.id, subject, undefined, "/my-tasks");
    result.reminders++;
  }

  // ── 2. Deadline Countdown Alerts (24h, 10h, 2h) & Founder Escalations ──
  const nowMs = now.getTime();

  for (const p of active) {
    if (!p.assignee?.active || !p.internalDeadline) continue;
    const dueMs = p.internalDeadline.getTime();
    const diffHours = (dueMs - nowMs) / (1000 * 60 * 60);

    // Case 1: Post-Deadline Breach (+24 Hours Overdue without response)
    // -> Alert Assignee, Assigner, and ESCALATE TO ALL FOUNDERS (Suraj, Pratik, Sachin, Uday)
    if (diffHours <= -24) {
      // 1. Alert Assignee
      await notify(
        p.assignee.id,
        `🚨 CRITICAL OVERDUE: ${p.title} (+24h)`,
        `Deliverable is 24h+ overdue without an updated timeline. Founders have been alerted.`,
        `/my-tasks?task=${p.id}`
      );
      // 2. Alert Assigner
      if (p.createdById && p.createdById !== p.assigneeId) {
        await notify(
          p.createdById,
          `⚠️ OVERDUE 24H: ${p.title}`,
          `Assigned to ${p.assignee.name} · No response received in 24 hours.`,
          `/projects?task=${p.id}`
        );
      }
      // 3. Escalate to Founders: Suraj, Pratik, Sachin, Uday
      await alertFoundersOverdue({
        id: p.id,
        title: p.title,
        code: p.code,
        brandName: p.brand?.name,
        assigneeName: p.assignee.name,
        overdueHours: Math.abs(Math.round(diffHours)),
      });
      result.escalated++;
      continue;
    }

    // Case 2: 2 Hours to Deadline (Final Call before Breach)
    if (diffHours > 0 && diffHours <= 2) {
      await notify(
        p.assignee.id,
        `🚨 CRITICAL (2H): ${p.title}`,
        `Only 2 hours remaining until deadline! Confirm delivery or request timeline extension immediately.`,
        `/my-tasks?task=${p.id}`
      );
      await sendMail(
        p.assignee.email,
        `🚨 CRITICAL: 2 Hours to deadline for ${p.title}`,
        emailHtml({
          heading: `Final Call: ${p.title} is due in 2 hours`,
          intro: `Hi ${p.assignee.name.split(" ")[0]}, you have less than 2 hours remaining until your scheduled delivery deadline. If you cannot finish on time, please submit a revised timeline with a note immediately to prevent client escalation:`,
          head: ["Field", "Details"],
          rows: [
            ["Deliverable", `${p.code} · ${p.title}`],
            ["Brand", p.brand?.name ?? "—"],
            ["Internal Deadline", fmtDate(p.internalDeadline, true)],
            ["Client Air Date", p.externalDeadline ? fmtDate(p.externalDeadline) : "Not set"],
          ],
          cta: { label: "Confirm On Track or Revise Timeline", href: `${APP_URL}/my-tasks?task=${p.id}` },
        })
      );
      result.deadlineAlerts++;
      continue;
    }

    // Case 3: 10 Hours to Deadline (Urgent Countdown)
    if (diffHours > 2 && diffHours <= 10) {
      await notify(
        p.assignee.id,
        `⏰ URGENT (10H): ${p.title}`,
        `10 hours remaining until deadline. Please confirm you are on track or revise timeline.`,
        `/my-tasks?task=${p.id}`
      );
      await sendMail(
        p.assignee.email,
        `⏰ URGENT: 10 Hours to deadline for ${p.title}`,
        emailHtml({
          heading: `Urgent: ${p.title} is due today (10h remaining)`,
          intro: `Hi ${p.assignee.name.split(" ")[0]}, your internal deadline is in approximately 10 hours. If your progress is blocked or you need more time, please request a revised timeline with a note now:`,
          head: ["Field", "Details"],
          rows: [
            ["Deliverable", `${p.code} · ${p.title}`],
            ["Brand", p.brand?.name ?? "—"],
            ["Internal Deadline", fmtDate(p.internalDeadline, true)],
            ["Client Air Date", p.externalDeadline ? fmtDate(p.externalDeadline) : "Not set"],
          ],
          cta: { label: "Confirm On Track or Revise Timeline", href: `${APP_URL}/my-tasks?task=${p.id}` },
        })
      );
      result.deadlineAlerts++;
      continue;
    }

    // Case 4: 24 Hours to Deadline (First Check-In)
    if (diffHours > 10 && diffHours <= 24) {
      await notify(
        p.assignee.id,
        `⏳ 24h to deadline: ${p.title}`,
        `Delivery due tomorrow. Please confirm progress or request a revised timeline.`,
        `/my-tasks?task=${p.id}`
      );
      await sendMail(
        p.assignee.email,
        `⏳ 24h to delivery deadline: ${p.title}`,
        emailHtml({
          heading: `Check-in: ${p.title} is due tomorrow`,
          intro: `Hi ${p.assignee.name.split(" ")[0]}, your internal delivery deadline for "${p.title}" is in 24 hours (${fmtDate(p.internalDeadline)}). Please confirm you are on track or request a timeline change so management can balance resources:`,
          head: ["Field", "Details"],
          rows: [
            ["Deliverable", `${p.code} · ${p.title}`],
            ["Brand", p.brand?.name ?? "—"],
            ["Internal Deadline", fmtDate(p.internalDeadline, true)],
            ["Client Air Date", p.externalDeadline ? fmtDate(p.externalDeadline) : "Not set"],
          ],
          cta: { label: "Confirm On Track or Revise Timeline", href: `${APP_URL}/my-tasks?task=${p.id}` },
          footer: "Please confirm your delivery status as early as possible so management can balance studio resources.",
        })
      );
      result.deadlineAlerts++;
      continue;
    }
  }

  // 2b. General 3-day deadline heads-up
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
