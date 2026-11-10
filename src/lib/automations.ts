import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { adminUsers, alertFoundersOverdue, notify, sendSmartReminderStage } from "@/lib/notify";
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

  // ── 1. Unified Daily Digest Email (Points 8, 9, 10: Overdue Escalation L1/L2/L3 + Inactive Tasks + Missing Details + Budget Alerts) ──
  const allTeamUsers = await prisma.user.findMany({ where: { active: true } });
  const allTeamEmails = allTeamUsers.map((u) => u.email);

  // Group per-person digest items so each person receives ONE summarized email covering all their alerts
  type DigestRow = [string, string, string, string, string];
  const personDigests = new Map<
    string,
    {
      user: { id: string; name: string; email: string };
      maxEscalationLevel: number;
      rows: DigestRow[];
    }
  >();

  const ensureDigest = (u: { id: string; name: string; email: string }) => {
    if (!personDigests.has(u.id)) {
      personDigests.set(u.id, { user: u, maxEscalationLevel: 1, rows: [] });
    }
    return personDigests.get(u.id)!;
  };

  for (const p of active) {
    // Point 9b: Unassigned task -> notify Admin so it gets allocated
    if (!p.assignee || !p.assignee.active) {
      for (const adm of admins) {
        const d = ensureDigest(adm);
        d.rows.push([
          p.title,
          p.brand?.name ?? "—",
          "🚨 UNASSIGNED TASK",
          computeStage(p).label,
          "Allocate owner",
        ]);
      }
      continue;
    }

    const person = p.assignee;
    const dl = p.internalDeadline ? startOfToday(p.internalDeadline) : null;
    const isOverdue = waitingOn(p) !== "BRAND" && dl !== null && dl < today;

    // Point 8: Overdue Escalation (L1: Assignee -> L2: Manager + Assignee -> L3: Admin + Team)
    if (isOverdue) {
      await prisma.project.update({
        where: { id: p.id },
        data: { reminderCount: { increment: 1 } },
      });
      const level = p.reminderCount + 1;
      const d = ensureDigest(person);
      d.maxEscalationLevel = Math.max(d.maxEscalationLevel, level);
      d.rows.push([
        p.title,
        p.brand?.name ?? "—",
        level === 1
          ? "⏰ OVERDUE (Level 1 · Assignee)"
          : level === 2
            ? "⚠️ OVERDUE (Level 2 · Manager & Assignee)"
            : "🚨 OVERDUE (Level 3 · Admin & Team)",
        computeStage(p).label,
        fmtDate(p.internalDeadline) || "Past due",
      ]);
    }

    // Point 9a: No movement / Inactivity alert (2 days urgent/high, 3 days medium, 6 days long-running)
    const daysInactive = daysBetween(p.updatedAt, today);
    const inactivityLimit =
      p.priority === "urgent" || p.priority === "high" ? 2 : p.priority === "medium" ? 3 : 6;
    if (daysInactive >= inactivityLimit) {
      const d = ensureDigest(person);
      d.rows.push([
        p.title,
        p.brand?.name ?? "—",
        `⏳ INACTIVE (${daysInactive}d no movement)`,
        computeStage(p).label,
        `Limit: ${inactivityLimit}d`,
      ]);
    }

    // Point 9c: Missing required details alert
    const missing: string[] = [];
    if (!p.internalDeadline) missing.push("Due Date");
    if (!p.campaignId) missing.push("Campaign");
    if (!p.storageId) missing.push("Hard Drive");
    if (!p.context?.trim()) missing.push("Description");
    if (!p.workType) missing.push("Work Type");
    if (missing.length > 0) {
      const d = ensureDigest(person);
      d.rows.push([
        p.title,
        p.brand?.name ?? "—",
        `⚠️ MISSING DETAILS: ${missing.join(", ")}`,
        computeStage(p).label,
        "Fill required fields",
      ]);
    }

    // Point 10: Budget Alerts (50% Manager, 75% Manager+Admin, 90%+ Admin + Red Flag)
    const totalMinutes = p.timeEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalHours = totalMinutes / 60;
    const estCost = totalHours * 400; // ₹300 labor + ₹100 overhead baseline
    const budget = 50000;
    const budgetPct = Math.round((estCost / budget) * 100);
    if (budgetPct >= 50) {
      const alertLabel =
        budgetPct >= 90
          ? `🚨 ${budgetPct}% BUDGET USED (Flagged Red)`
          : budgetPct >= 75
            ? `⚠️ ${budgetPct}% BUDGET USED (75%+ Alert)`
            : `ℹ️ ${budgetPct}% BUDGET USED (50%+ Notice)`;
      for (const mgr of managers) {
        ensureDigest(mgr).rows.push([
          p.title,
          p.brand?.name ?? "—",
          alertLabel,
          computeStage(p).label,
          `${budgetPct}% of ₹${budget.toLocaleString("en-IN")}`,
        ]);
      }
      if (budgetPct >= 75) {
        for (const adm of admins) {
          ensureDigest(adm).rows.push([
            p.title,
            p.brand?.name ?? "—",
            alertLabel,
            computeStage(p).label,
            `${budgetPct}% of ₹${budget.toLocaleString("en-IN")}`,
          ]);
        }
      }
    }
  }

  // Send ONE consolidated digest email per person (Points 8, 9, 10)
  for (const [, digest] of personDigests) {
    if (digest.rows.length === 0) continue;
    const { user: person, maxEscalationLevel: level, rows } = digest;

    let ccEmails: string[] | undefined = undefined;
    let subjectPrefix = "📋 Daily Task & Alert Digest: ";
    if (level === 2 && managerEmails.length) {
      ccEmails = managerEmails;
      subjectPrefix = "⚠️ Level 2 Escalation Digest (Manager + Assignee): ";
      result.escalated++;
    } else if (level >= 3 && adminEmails.length) {
      ccEmails = [...new Set([...adminEmails, ...managerEmails, ...allTeamEmails])];
      subjectPrefix = `🚨 Level 3 Critical Escalation Digest (Admin + Team): `;
      result.escalated++;
    }

    const subject = `${subjectPrefix}${rows.length} item${rows.length > 1 ? "s" : ""} requiring attention`;
    await sendMail(
      person.email,
      subject,
      emailHtml({
        heading: `Hi ${person.name.split(" ")[0]}, your consolidated TBM Portal digest`,
        intro:
          "Here is your single summarized daily digest covering overdue tasks (L1/L2/L3 escalation), inactive tasks, missing mandatory task details, and project budget alerts:",
        head: ["Task / Project", "Brand", "Alert Type & Missing Gaps", "Stage", "Status / Due"],
        rows,
        cta: { label: "Open My Tasks & Fix Highlighted Gaps", href: `${APP_URL}/my-tasks` },
      }),
      ccEmails
    );
    await notify(person.id, subject, undefined, "/my-tasks");
    result.reminders++;
  }

  // ── 2. Smart Deadline Reminder & Escalation Pipeline (Slack × Jira Style) ──
  // Pipeline:
  //   • T-24h before deadline -> Team Member (structured Slack/Jira card)
  //   • Deadline Day 10:00 AM -> Team Member morning check-in
  //   • Deadline Day 6:00 PM -> Team Member evening window check-in (6 PM - 8 PM)
  //   • Deadline Day 8:00 PM (if nothing changed between 6 PM and 8 PM) -> Team Member urgent progress reminder
  //   • Next Morning 10:00 AM (1 day past deadline) -> Reporting Manager Escalation (24h window to act)
  //   • +24h after Manager Escalation with no action -> All 6 Founders (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu)
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const istHour = istNow.getHours();
  const today6PmMs = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate(), 18, 0, 0).getTime();

  for (const p of active) {
    if (!p.assignee?.active || !p.internalDeadline) continue;
    const dlDay = startOfToday(p.internalDeadline);
    const dayDiff = daysBetween(today, dlDay); // +1 = due tomorrow (T-24h), 0 = due today, -1 = due yesterday (Next Morning 10 AM Manager), <= -2 = +24h after Manager (Founders)
    const hoursSinceLastUpdate = (now.getTime() - p.updatedAt.getTime()) / (1000 * 60 * 60);

    // Stage 6: 24h after Manager Reminder with NO action -> Escalate to ALL 6 FOUNDERS (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu)
    if (dayDiff <= -2 && hoursSinceLastUpdate >= 24) {
      await sendSmartReminderStage(p, "FOUNDER_24H_ESCALATION");
      result.escalated++;
      continue;
    }

    // Stage 5: Next Morning at 10:00 AM IST (1 day past deadline) -> Reporting Manager gets reminder
    if (dayDiff === -1) {
      await sendSmartReminderStage(p, "NEXT_DAY_10AM_MANAGER");
      result.escalated++;
      continue;
    }

    // Stages 2, 3, 4: Same Day of Deadline (10:00 AM -> 6:00 PM -> 8:00 PM if nothing changed since 6 PM)
    if (dayDiff === 0) {
      if (istHour >= 20) {
        // 8:00 PM check: did anything change between 6:00 PM and 8:00 PM?
        const updatedSince6Pm = p.updatedAt.getTime() >= today6PmMs;
        if (!updatedSince6Pm) {
          await sendSmartReminderStage(p, "DEADLINE_8PM_NO_CHANGE");
          result.deadlineAlerts++;
        }
      } else if (istHour >= 16) {
        // 6:00 PM check-in
        await sendSmartReminderStage(p, "DEADLINE_6PM");
        result.deadlineAlerts++;
      } else {
        // 10:00 AM morning check-in
        await sendSmartReminderStage(p, "DEADLINE_10AM");
        result.deadlineAlerts++;
      }
      continue;
    }

    // Stage 1: 24 Hours Before Deadline (T-24h) -> Clear, defined Slack/Jira card to Team Member
    if (dayDiff === 1) {
      await sendSmartReminderStage(p, "BEFORE_24H");
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

  // ── 5. Monday weekly report + Weekly Goal Achievement Report (Point 2) ──
  const istDay = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
  const weeklyRecipients = [...new Set([...adminEmails, ...managerEmails])];
  if ((istDay === 1 || opts.weekly) && weeklyRecipients.length) {
    const dtos = projects.map(toTaskDTO);
    const act = dtos.filter((t) => !isDone(t));
    const delays = act.map((t) => ({ t, d: computeDelay(t) })).filter((x) => x.d);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const deliveredThisWeek = projects.filter((p) => isDone(p) && p.updatedAt > weekAgo);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const dueThisWeek = act.filter((t) => t.internalDeadline && new Date(t.internalDeadline) <= weekEnd && new Date(t.internalDeadline) >= today);

    const goals = await prisma.goal.findMany({
      include: { owner: { select: { name: true } }, brand: { select: { name: true } } },
    });
    const achievedGoals = goals.filter((g) => g.status === "Achieved" || g.progress >= 100);
    const unachievedGoals = goals.filter((g) => g.status !== "Achieved" && g.progress < 100);

    await sendMail(
      weeklyRecipients,
      `📊 Weekly Studio & Goal Achievement Report — ${achievedGoals.length}/${goals.length} goals achieved, ${act.length} active`,
      emailHtml({
        heading: "Your week in post-production & Goal Achievement",
        intro: `Goals Achieved: ${achievedGoals.length} of ${goals.length}\nGoals Not Yet Achieved: ${unachievedGoals.length}\nActive Deliverables: ${act.length}\nLate (team): ${delays.filter((x) => x.d!.who === "EDITOR").length}\nDelivered in the last 7 days: ${deliveredThisWeek.length}\nDue this week: ${dueThisWeek.length}`,
        head: ["Goal / Deliverable", "Brand", "Owner / Assignee", "Status", "Progress / Delay"],
        rows: [
          ...goals.map((g) => [
            `🎯 GOAL: ${g.title}`,
            g.brand?.name ?? "Studio-wide",
            g.owner?.name ?? "Team",
            g.status === "Achieved" || g.progress >= 100 ? "✓ ACHIEVED" : `⏳ NOT ACHIEVED (${g.status})`,
            `${g.progress}%`,
          ]),
          ...delays
            .sort((a, b) => b.d!.days - a.d!.days)
            .slice(0, 15)
            .map(({ t, d }) => [
              t.title,
              t.brandName ?? "—",
              t.assigneeName ?? "Unassigned",
              d!.who === "EDITOR" ? "Late (Team)" : "Waiting on Brand",
              `${d!.days}d late`,
            ]),
        ],
        cta: { label: "Open Goals & Studio Dashboard", href: `${APP_URL}/goals` },
      }),
    );
    result.weekly = true;
  }

  await prisma.automationRun.create({ data: { source, result: JSON.stringify(result) } });
  return result;
}
