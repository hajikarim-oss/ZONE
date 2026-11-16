import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail } from "@/lib/mailer";
import { adminUsers, alertFoundersOverdue, founderUsers, FOUNDER_EMAILS, notify, sendSmartReminderStage } from "@/lib/notify";
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

  // ── 1. Unified Single Daily Briefing Email (One Refined Email per Team Member) ──
  const allTeamUsers = await prisma.user.findMany({ where: { active: true } });
  const allTeamEmails = allTeamUsers.map((u) => u.email);

  type DigestItem = {
    code: string;
    title: string;
    brand: string;
    alertType: string;
    stage: string;
    dueOrStatus: string;
    isOverdue: boolean;
    isDueToday: boolean;
  };

  const personDigests = new Map<
    string,
    {
      user: { id: string; name: string; email: string };
      maxEscalationLevel: number;
      items: DigestItem[];
    }
  >();

  const ensureDigest = (u: { id: string; name: string; email: string }) => {
    if (!personDigests.has(u.id)) {
      personDigests.set(u.id, { user: u, maxEscalationLevel: 1, items: [] });
    }
    return personDigests.get(u.id)!;
  };

  // Manager & Founder Escalation collections (Consolidated into 1 email each, never 5-6 emails)
  const managerEscalations: { code: string; title: string; brand: string; assignee: string; delay: string; action: string }[] = [];
  const founderEscalations: { code: string; title: string; brand: string; assignee: string; manager: string; delay: string }[] = [];

  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const istHour = istNow.getHours();
  const today6PmMs = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate(), 18, 0, 0).getTime();

  for (const p of active) {
    // A. Unassigned task -> add to Manager action collection
    if (!p.assignee || !p.assignee.active) {
      managerEscalations.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        assignee: "Unassigned",
        delay: "Unassigned Task",
        action: "Assign lead editor & define deadline",
      });
      continue;
    }

    const person = p.assignee;
    const dl = p.internalDeadline ? startOfToday(p.internalDeadline) : null;
    const dayDiff = dl !== null ? daysBetween(today, dl) : null; // +1 = due tomorrow, 0 = due today, <0 = overdue
    const hoursSinceLastUpdate = (now.getTime() - p.updatedAt.getTime()) / (1000 * 60 * 60);

    // B. Critical Overdue check (Founder & Manager Escalations)
    if (dayDiff !== null && dayDiff <= -2 && hoursSinceLastUpdate >= 24) {
      // 48h+ past deadline with zero manager action -> Founder Escalation collection
      founderEscalations.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        assignee: person.name,
        manager: p.createdBy?.name || "Production Manager",
        delay: `${Math.abs(dayDiff)} days overdue (No manager action for 24h)`,
      });
      result.escalated++;
    } else if (dayDiff !== null && dayDiff === -1) {
      // 1 day past deadline -> Manager Escalation collection
      managerEscalations.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        assignee: person.name,
        delay: "1 day overdue (Missed deadline & watchdog)",
        action: "Intervene, rebalance scope, or extend deadline",
      });
      result.escalated++;
    }

    // C. Team Member Active Alerts (Categorized into single digest)
    const isOverdue = waitingOn(p) !== "BRAND" && dl !== null && dl < today;

    if (isOverdue) {
      await prisma.project.update({
        where: { id: p.id },
        data: { reminderCount: { increment: 1 } },
      });
      const level = p.reminderCount + 1;
      const d = ensureDigest(person);
      d.maxEscalationLevel = Math.max(d.maxEscalationLevel, level);
      d.items.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        alertType:
          level === 1
            ? "⏰ OVERDUE (Level 1 · Action Required)"
            : level === 2
            ? "⚠️ OVERDUE (Level 2 · Manager Escalated)"
            : "🚨 OVERDUE (Level 3 · Admin Escalated)",
        stage: computeStage(p).label,
        dueOrStatus: fmtDate(p.internalDeadline) || "Past due",
        isOverdue: true,
        isDueToday: false,
      });
    } else if (dayDiff === 0) {
      // Due Today (10 AM Kickoff or Evening 6 PM - 8 PM Window)
      const timingLabel =
        istHour >= 20
          ? "🚨 8:00 PM Watchdog: No progress logged between 6 PM - 8 PM"
          : istHour >= 16
          ? "🌆 6:00 PM Delivery Window: Upload export cut / log ETA"
          : "☀️ DUE TODAY: Morning kickoff · Plan exports & start session timer";

      const d = ensureDigest(person);
      d.items.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        alertType: timingLabel,
        stage: computeStage(p).label,
        dueOrStatus: "Due Today",
        isOverdue: false,
        isDueToday: true,
      });
      result.deadlineAlerts++;
    } else if (dayDiff === 1) {
      // Due Tomorrow (T-24h milestone)
      const d = ensureDigest(person);
      d.items.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        alertType: "⏳ DUE TOMORROW: 24h milestone · Confirm on track or request extension",
        stage: computeStage(p).label,
        dueOrStatus: fmtDate(p.internalDeadline) || "Tomorrow",
        isOverdue: false,
        isDueToday: false,
      });
      result.deadlineAlerts++;
    }

    // Inactive task alert (no updates for 2+ days)
    const daysInactive = daysBetween(p.updatedAt, today);
    const inactivityLimit = p.priority === "urgent" || p.priority === "high" ? 2 : p.priority === "medium" ? 3 : 6;
    if (daysInactive >= inactivityLimit && !isOverdue && dayDiff !== 0) {
      const d = ensureDigest(person);
      d.items.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        alertType: `⏳ INACTIVE: ${daysInactive}d no activity (Limit: ${inactivityLimit}d)`,
        stage: computeStage(p).label,
        dueOrStatus: "Needs progress update",
        isOverdue: false,
        isDueToday: false,
      });
    }

    // Missing required task details alert
    const missing: string[] = [];
    if (!p.internalDeadline) missing.push("Due Date");
    if (!p.campaignId) missing.push("Campaign");
    if (!p.storageId) missing.push("Hard Drive");
    if (!p.context?.trim()) missing.push("Description/Brief");
    if (!p.workType) missing.push("Work Type");
    if (missing.length > 0 && !isOverdue && dayDiff !== 0) {
      const d = ensureDigest(person);
      d.items.push({
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? "—",
        alertType: `ℹ️ MISSING REQUIRED FIELDS: ${missing.join(", ")}`,
        stage: computeStage(p).label,
        dueOrStatus: "Fill required fields",
        isOverdue: false,
        isDueToday: false,
      });
    }
  }

  // ── Dispatch EXACTLY ONE consolidated daily email per team member ──
  for (const [, digest] of personDigests) {
    if (digest.items.length === 0) continue;
    const { user: person, maxEscalationLevel: level, items } = digest;

    let ccEmails: string[] | undefined = undefined;
    let badgeText = "DAILY OPERATIONS BRIEFING";
    let badgeTone = "blue";
    let subject = `📋 TBM Daily Briefing: ${items.length} item${items.length > 1 ? "s" : ""} on your plate`;

    const hasOverdue = items.some((i) => i.isOverdue);
    const hasDueToday = items.some((i) => i.isDueToday);

    if (hasOverdue) {
      badgeText = "ACTION REQUIRED · OVERDUE ITEMS";
      badgeTone = "red";
      subject = `⚠️ TBM Daily Briefing: ${items.length} item${items.length > 1 ? "s" : ""} requiring attention (${items[0].code})`;
      if (level === 2 && managerEmails.length) {
        ccEmails = managerEmails;
        badgeText = "LEVEL 2 ESCALATION · MANAGER NOTIFIED";
        badgeTone = "orange";
        subject = `⚠️ Level 2 Escalation Briefing: ${items.length} item${items.length > 1 ? "s" : ""} overdue`;
        result.escalated++;
      } else if (level >= 3 && adminEmails.length) {
        ccEmails = [...new Set([...adminEmails, ...managerEmails, ...allTeamEmails])];
        badgeText = "LEVEL 3 CRITICAL ESCALATION";
        badgeTone = "red";
        subject = `🚨 Level 3 Critical Escalation: ${items.length} item${items.length > 1 ? "s" : ""} requiring immediate intervention`;
        result.escalated++;
      }
    } else if (hasDueToday) {
      badgeText = "DEADLINE TODAY · 10 AM KICKOFF";
      badgeTone = "amber";
      subject = `☀️ TBM Morning Kickoff: Deliverables scheduled for delivery today`;
    }

    const rows: string[][] = items.map((i) => [
      `[${i.code}] ${i.title}`,
      i.brand,
      i.alertType,
      i.stage,
      i.dueOrStatus,
    ]);

    await sendMail(
      person.email,
      subject,
      emailHtml({
        heading: `Hi ${person.name.split(" ")[0]}, your consolidated daily delivery briefing`,
        intro:
          "Here is your single, consolidated daily briefing covering all your deliverables, milestone deadlines, and required actions for today:",
        head: ["Deliverable & Key", "Brand", "Alert & Milestone Status", "Current Stage", "Due Date"],
        rows,
        cta: { label: "🚀 Open My Tasks & Log Progress", href: `${APP_URL}/my-tasks` },
        footer: "The Bored Monkey Studio · Consolidated daily brief (1 email per team member).",
      }),
      ccEmails
    );

    await notify(person.id, subject, undefined, "/my-tasks");
    result.reminders++;
  }

  // ── Dispatch EXACTLY ONE consolidated Manager Action Digest (if any tasks need manager attention) ──
  if (managerEscalations.length > 0 && managerEmails.length > 0) {
    const mgrSubject = `⚠️ Production Management Briefing: ${managerEscalations.length} deliverable${managerEscalations.length > 1 ? "s" : ""} requiring manager intervention`;
    await sendMail(
      managerEmails,
      mgrSubject,
      emailHtml({
        heading: `Production Management Action Digest`,
        intro:
          "The following deliverables require managerial intervention (unassigned tasks, missed deadlines, or Level 2 escalations past the watchdog window):",
        head: ["Issue Key & Title", "Brand", "Assigned Editor", "Delay Status", "Required Action"],
        rows: managerEscalations.map((m) => [
          `[${m.code}] ${m.title}`,
          m.brand,
          m.assignee,
          m.delay,
          m.action,
        ]),
        cta: { label: "🛠️ Open Manager Project Board", href: `${APP_URL}/projects` },
        footer: "The Bored Monkey Studio · Consolidated manager alert digest.",
      })
    );
  }

  // ── Dispatch EXACTLY ONE consolidated Founder Escalation Digest (if any tasks are >48h overdue) ──
  if (founderEscalations.length > 0) {
    const founders = await founderUsers();
    const founderEmailList = [...new Set([...FOUNDER_EMAILS, ...founders.map((f) => f.email)])];
    const founderSubject = `🚨 [P0 Founder Escalation] ${founderEscalations.length} deliverable${founderEscalations.length > 1 ? "s" : ""} delayed 48h+ with no manager resolution`;

    await sendMail(
      founderEmailList,
      founderSubject,
      emailHtml({
        heading: `Executive Founder Delivery Alert (48h+ Inaction)`,
        intro:
          "Attention Founders (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu): The following deliverables have missed their defined deadline and have remained unresolved for 24+ hours following manager escalation:",
        head: ["Deliverable & Key", "Brand", "Assigned Editor", "Reporting Manager", "Delay Details"],
        rows: founderEscalations.map((f) => [
          `[${f.code}] ${f.title}`,
          f.brand,
          f.assignee,
          f.manager,
          f.delay,
        ]),
        cta: { label: "🔍 Review Studio Deliverables Board", href: `${APP_URL}/projects` },
        footer: "The Bored Monkey Studio · Direct executive escalation to Founders.",
      }),
      managerEmails
    );
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
