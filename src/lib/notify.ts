import { prisma } from "@/lib/prisma";
import { APP_URL, emailHtml, sendMail, slackJiraEmailHtml } from "@/lib/mailer";
import { fmtDate } from "@/lib/utils";
import type { Brand, Project, User } from "@prisma/client";

type P = Project & {
  brand: Brand | null;
  assignee: User | null;
  campaign?: { name: string } | null;
  createdBy?: { name: string; email?: string } | null;
};

export type SmartReminderStage =
  | "ASSIGNED"
  | "BEFORE_24H"
  | "DEADLINE_10AM"
  | "DEADLINE_6PM"
  | "DEADLINE_8PM_NO_CHANGE"
  | "NEXT_DAY_10AM_MANAGER"
  | "FOUNDER_24H_ESCALATION";

// All 6 Founders: Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu
export const FOUNDER_NAMES = [
  "Pratik",
  "Suraj",
  "Sachin",
  "Uday",
  "Suraj Maurya",
  "Monu",
];

export const FOUNDER_EMAILS = [
  "pratik@theboredmonkey.com",
  "suraj@theboredmonkey.com",
  "sachin@theboredmonkey.com",
  "uday@theboredmonkey.com",
  "suraj.maurya@theboredmonkey.com",
  "monu@theboredmonkey.com",
];

// In-app notification (Inbox)
export async function notify(userId: string, title: string, body?: string, href?: string) {
  await prisma.notification.create({ data: { userId, title, body, href } });
}

export async function adminUsers() {
  return prisma.user.findMany({ where: { role: "ADMIN", active: true } });
}

export async function founderUsers() {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { email: { in: FOUNDER_EMAILS } },
        { name: { in: FOUNDER_NAMES } },
      ],
    },
  });
}

function link(p: Project) {
  return `${APP_URL}/projects?task=${p.id}`;
}

function buildSmartTimelineSteps(activeStage: SmartReminderStage) {
  const order: SmartReminderStage[] = [
    "ASSIGNED",
    "BEFORE_24H",
    "DEADLINE_10AM",
    "DEADLINE_6PM",
    "DEADLINE_8PM_NO_CHANGE",
    "NEXT_DAY_10AM_MANAGER",
    "FOUNDER_24H_ESCALATION",
  ];
  const idx = order.indexOf(activeStage);
  const steps: { stage: SmartReminderStage; time: string; label: string }[] = [
    { stage: "ASSIGNED", time: "Step 0 · Assigned", label: "Manager assigns deliverable & defines deadline" },
    { stage: "BEFORE_24H", time: "T - 24 Hours", label: "24h Pre-Deadline Structured Check-In to Team Member" },
    { stage: "DEADLINE_10AM", time: "Due Day · 10:00 AM", label: "Morning Deadline Day Kickoff Reminder to Team Member" },
    { stage: "DEADLINE_6PM", time: "Due Day · 6:00 PM", label: "Evening Window Check-In (6 PM – 8 PM) to Team Member" },
    { stage: "DEADLINE_8PM_NO_CHANGE", time: "Due Day · 8:00 PM", label: "No Progress Since 6 PM → Urgent Update Reminder to Team Member" },
    { stage: "NEXT_DAY_10AM_MANAGER", time: "Next Day · 10:00 AM", label: "Missed Deadline → Escalated to Reporting Manager (24h Action Window)" },
    { stage: "FOUNDER_24H_ESCALATION", time: "+24h No Mgr Action", label: "Escalated to Founders (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu)" },
  ];
  return steps.map((s, i) => ({
    time: s.time,
    label: s.label,
    done: i < idx,
    active: i === idx,
  }));
}

/**
 * Sends a Slack + Jira style smart reminder or escalation for any of the 7 pipeline stages.
 */
export async function sendSmartReminderStage(
  p: P,
  stage: SmartReminderStage,
  extra?: { assignerName?: string; assignerEmail?: string | null; lastUpdatedStr?: string }
) {
  const assignee = p.assignee;
  const assignerName = extra?.assignerName || p.createdBy?.name || "Reporting Manager";
  const deadlineStr = fmtDate(p.internalDeadline, true) || "Deadline Pending";
  const clientDueStr = p.externalDeadline ? fmtDate(p.externalDeadline, true) : "Not set";
  const myTaskUrl = `${APP_URL}/my-tasks?task=${p.id}`;
  const managerTaskUrl = `${APP_URL}/projects?task=${p.id}`;
  const baseFields = [
    { label: "Issue Key & Deliverable", value: `${p.code} · ${p.title}` },
    { label: "Brand / Campaign", value: `${p.brand?.name ?? "Studio"} · ${p.campaign?.name ?? "General"}` },
    { label: "Assigned Team Member", value: assignee?.name ?? "Unassigned" },
    { label: "Assigned By (Manager)", value: assignerName },
    { label: "Defined Deadline", value: deadlineStr },
    { label: "Current Stage & Priority", value: `${p.editStatus} · ${p.priority.toUpperCase()}` },
  ];

  // STAGE 0: Manager Assigns Work & Defines Deadline
  if (stage === "ASSIGNED") {
    if (!assignee || !assignee.active) return;
    await notify(
      assignee.id,
      `📌 [Assignment · ${p.code}] Assigned by ${assignerName} · Due ${deadlineStr}`,
      `${p.brand?.name ?? "Brand"} · "${p.title}" — Smart reminder pipeline armed (T-24h, 10 AM, 6 PM, 8 PM).`,
      `/my-tasks?task=${p.id}`
    );
    await sendMail(
      assignee.email,
      `📌 [Assignment · ${p.code}] New Deliverable: "${p.title}" — Due ${deadlineStr}`,
      slackJiraEmailHtml({
        badgeText: "NEW ASSIGNMENT · DEADLINE DEFINED",
        badgeTone: "blue",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `You've been assigned to "${p.title}"`,
        intro: `Hi ${assignee.name.split(" ")[0]}, your manager (${assignerName}) has assigned this deliverable to you with a defined internal deadline of ${deadlineStr}. The automated tracking pipeline is armed to monitor milestones through final delivery.`,
        calloutTitle: "Production Brief & Delivery Instructions",
        calloutBody: [
          p.context?.trim() ? `• Creative Brief: ${p.context.trim()}` : null,
          `• Hard Drive / Assets: Confirm all raw footage, project files, and audio assets are mapped from your designated storage drive.`,
          `• Live Timer: Click 'Start Live Session' at the top of the task drawer when editing begins so productive hours and project costs track accurately.`,
          `• Client Target Air Date: ${clientDueStr}. Automated milestone check-ins will trigger at T-24h, 10:00 AM on deadline day, 6:00 PM, and 8:00 PM watchdog.`,
        ]
          .filter(Boolean)
          .join("\n"),
        fields: baseFields,
        timelineSteps: buildSmartTimelineSteps("ASSIGNED"),
        cta: { label: "🚀 Open Task & Start Timer", href: myTaskUrl },
        secondaryCta: { label: "📅 View Deliverable on Board", href: managerTaskUrl },
        footer: "TBM Smart Operations Engine · Direct delivery to assignee and manager.",
      })
    );
    return;
  }

  // STAGE 1: 24 Hours Before Deadline (Clear, structured Slack/Jira card to Team Member)
  if (stage === "BEFORE_24H") {
    if (!assignee || !assignee.active) return;
    await notify(
      assignee.id,
      `⏳ [T-24h Milestone · ${p.code}] Due Tomorrow (${deadlineStr})`,
      `24 hours remaining for "${p.title}". Confirm On Track or request an extension now.`,
      `/my-tasks?task=${p.id}`
    );
    await sendMail(
      assignee.email,
      `⏳ [T-24h Milestone · ${p.code}] 24 Hours Remaining for "${p.title}" (Due ${deadlineStr})`,
      slackJiraEmailHtml({
        badgeText: "T-24H PRE-DEADLINE CHECK-IN",
        badgeTone: "amber",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `24-Hour Delivery Notice: "${p.title}" is due tomorrow`,
        intro: `Hi ${assignee.name.split(" ")[0]}, you are exactly 24 hours away from the internal delivery deadline set by ${assignerName} (${deadlineStr}). Please review your cut progress against the brief.`,
        calloutTitle: "Pre-Deadline Checklist & Action Items",
        calloutBody: [
          "• On Schedule: If your export will be ready tomorrow, click 'Confirm On Track' in the task drawer.",
          `• Need an Extension: If blocked by missing footage, audio stems, or client feedback, request an extension now so ${assignerName} can adjust external delivery expectations before deadline day.`,
          "• Next automated checkpoint: Tomorrow morning at 10:00 AM IST.",
        ].join("\n"),
        fields: baseFields,
        timelineSteps: buildSmartTimelineSteps("BEFORE_24H"),
        cta: { label: "✅ Confirm On Track", href: myTaskUrl },
        secondaryCta: { label: "📅 Request Timeline Extension", href: myTaskUrl },
        footer: "TBM Smart Operations Engine · Next checkpoint: Tomorrow at 10:00 AM IST.",
      })
    );
    return;
  }

  // STAGE 2: Same Day of Deadline at 10:00 AM IST
  if (stage === "DEADLINE_10AM") {
    if (!assignee || !assignee.active) return;
    await notify(
      assignee.id,
      `☀️ [Deadline Day · 10:00 AM · ${p.code}] Final Delivery Due Today: "${p.title}"`,
      `Morning kickoff: start your live session timer and review your export checklist.`,
      `/my-tasks?task=${p.id}`
    );
    await sendMail(
      assignee.email,
      `☀️ [Deadline Day · 10:00 AM · ${p.code}] Final Delivery Due Today: "${p.title}"`,
      slackJiraEmailHtml({
        badgeText: "DEADLINE TODAY · 10:00 AM KICKOFF",
        badgeTone: "amber",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `Morning Kickoff: "${p.title}" is scheduled for delivery today`,
        intro: `Good morning ${assignee.name.split(" ")[0]}, today is the official delivery date for "${p.title}" (assigned by ${assignerName}). Please plan your export and review timeline accordingly.`,
        calloutTitle: "Today's Delivery Windows (10 AM → 6 PM → 8 PM Watchdog)",
        calloutBody: [
          "• 10:00 AM – 6:00 PM: Active editing window. Start your live session timer at the top of the task drawer.",
          "• 6:00 PM IST: Evening check-in opens. Target to have your export link (Cut v1 / Internal Review) uploaded.",
          "• 8:00 PM IST Watchdog: If no status change, link upload, or progress log is detected between 6:00 PM and 8:00 PM, an urgent watchdog reminder triggers, followed by tomorrow's 10:00 AM Manager Escalation.",
        ].join("\n"),
        fields: baseFields,
        timelineSteps: buildSmartTimelineSteps("DEADLINE_10AM"),
        cta: { label: "▶️ Start Live Session & Update Status", href: myTaskUrl },
        secondaryCta: { label: "📝 Post Status Update", href: myTaskUrl },
        footer: "TBM Smart Operations Engine · Next checkpoint: Today at 6:00 PM IST.",
      })
    );
    return;
  }

  // STAGE 3: Same Day of Deadline at 6:00 PM IST
  if (stage === "DEADLINE_6PM") {
    if (!assignee || !assignee.active) return;
    await notify(
      assignee.id,
      `🌆 [6:00 PM Window · ${p.code}] 2-Hour Delivery Check for "${p.title}"`,
      `Delivery window open (6 PM – 8 PM). Please upload export cut or log progress now.`,
      `/my-tasks?task=${p.id}`
    );
    await sendMail(
      assignee.email,
      `🌆 [6:00 PM Window · ${p.code}] 2-Hour Delivery Check for "${p.title}" (6 PM – 8 PM)`,
      slackJiraEmailHtml({
        badgeText: "6:00 PM DELIVERY WINDOW (6 PM – 8 PM)",
        badgeTone: "orange",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `Evening Check-In: Please upload cut or log progress before 8:00 PM`,
        intro: `Hi ${assignee.name.split(" ")[0]}, the standard workday delivery window for "${p.title}" is now open. The deliverable is currently in status "${p.editStatus}".`,
        calloutTitle: "⚠️ Active 6:00 PM – 8:00 PM Activity Watchdog",
        calloutBody: [
          "• Upload Export Link: Drop your Google Drive, Frame.io, or Dropbox review link into the task drawer and set stage to 'Internal Review'.",
          "• Still Polishing: If you are finalizing exports, click 'Log Progress' or add an ETA note.",
          `• Automated Watchdog Rule: If zero activity is detected between 6:00 PM and 8:00 PM, an urgent 8:00 PM notice will be dispatched, followed by a direct escalation to ${assignerName} at 10:00 AM tomorrow.`,
        ].join("\n"),
        fields: baseFields,
        timelineSteps: buildSmartTimelineSteps("DEADLINE_6PM"),
        cta: { label: "📤 Upload Cut / Change Status", href: myTaskUrl },
        secondaryCta: { label: "⏱️ Log Progress & ETA", href: myTaskUrl },
        footer: "TBM Smart Operations Engine · Watchdog evaluation occurs at 8:00 PM IST.",
      })
    );
    return;
  }

  // STAGE 4: Same Day at 8:00 PM IST (Nothing changed between 6:00 PM and 8:00 PM)
  if (stage === "DEADLINE_8PM_NO_CHANGE") {
    if (!assignee || !assignee.active) return;
    await notify(
      assignee.id,
      `🚨 [8:00 PM Watchdog Notice · ${p.code}] No activity detected between 6 PM – 8 PM!`,
      `Please update progress on "${p.title}" tonight. Otherwise ${assignerName} will be escalated at 10:00 AM tomorrow.`,
      `/my-tasks?task=${p.id}`
    );
    await sendMail(
      assignee.email,
      `🚨 [8:00 PM Watchdog Notice · ${p.code}] No progress recorded between 6 PM – 8 PM on "${p.title}"`,
      slackJiraEmailHtml({
        badgeText: "8:00 PM WATCHDOG · NO PROGRESS DETECTED",
        badgeTone: "red",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `Urgent Notice: Delivery window passed with no recorded progress`,
        intro: `Hi ${assignee.name.split(" ")[0]}, the automated watchdog detected no status updates, cut links, or time logs on "${p.title}" during the 6:00 PM – 8:00 PM delivery window today.`,
        calloutTitle: "Immediate Action Required Before 10:00 AM Manager Escalation",
        calloutBody: [
          "• Action Needed Tonight: Log your current progress, paste your draft cut link, or submit a timeline revision.",
          `• Escalation Rule: If this deliverable remains un-updated tomorrow morning at 10:00 AM IST, a formal Level 2 Manager Escalation will be dispatched to ${assignerName} with a 24-hour action window.`,
        ].join("\n"),
        fields: [
          ...baseFields,
          { label: "6 PM – 8 PM Activity", value: "❌ Zero changes detected" },
          { label: "Next Escalation", value: `Tomorrow 10:00 AM → ${assignerName}` },
        ],
        timelineSteps: buildSmartTimelineSteps("DEADLINE_8PM_NO_CHANGE"),
        cta: { label: "⚡ Post Progress Update Tonight", href: myTaskUrl },
        secondaryCta: { label: "📅 Propose Revised Deadline", href: myTaskUrl },
        footer: "TBM Smart Operations Engine · Escalates to Reporting Manager tomorrow at 10:00 AM IST.",
      })
    );
    return;
  }

  // STAGE 5: Next Morning at 10:00 AM IST → Reporting Manager Escalation (24h window before Founders)
  if (stage === "NEXT_DAY_10AM_MANAGER") {
    const managers = await prisma.user.findMany({ where: { role: "MANAGER", active: true } });
    const managerTargets = new Map<string, { id: string; name: string; email: string }>();
    for (const m of managers) managerTargets.set(m.id, m);

    if (p.createdById) {
      const creator = await prisma.user.findUnique({ where: { id: p.createdById } });
      if (creator && creator.active) managerTargets.set(creator.id, creator);
    }
    if (managerTargets.size === 0) {
      const admins = await adminUsers();
      for (const a of admins) managerTargets.set(a.id, a);
    }

    const mgrEmails = Array.from(managerTargets.values()).map((m) => m.email);
    const ccList = assignee?.email ? [assignee.email] : undefined;

    for (const mgr of managerTargets.values()) {
      await notify(
        mgr.id,
        `⚠️ [Level 2 Escalation · 10:00 AM · ${p.code}] "${p.title}" missed deadline`,
        `Assigned to ${assignee?.name ?? "Unassigned"} · 24h action window before Founder Escalation (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu).`,
        `/projects?task=${p.id}`
      );
    }
    if (assignee?.active) {
      await notify(
        assignee.id,
        `⚠️ [Manager Alerted · ${p.code}] ${assignerName} notified at 10:00 AM`,
        `"${p.title}" is past due. If no action is taken within 24 hours, all Founders will be alerted.`,
        `/my-tasks?task=${p.id}`
      );
    }

    await sendMail(
      mgrEmails,
      `⚠️ [Level 2 Escalation · 10:00 AM · ${p.code}] Missed Deadline on "${p.title}" — 24h Action Window`,
      slackJiraEmailHtml({
        badgeText: "LEVEL 2 · MANAGER ESCALATION (10:00 AM)",
        badgeTone: "orange",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `Manager Action Required: "${p.title}" missed deadline and watchdog window`,
        intro: `Attention Production Management, this deliverable (assigned to ${assignee?.name ?? "Unassigned"}) passed its defined deadline (${deadlineStr}) without completion, and was unactioned through yesterday's 6:00 PM – 8:00 PM watchdog window.`,
        calloutTitle: "⏳ 24-Hour Manager Action Window (Before Founder Escalation)",
        calloutBody: [
          `• Required Action Within 24h:`,
          `  1. Check in with ${assignee?.name ?? "the editor"} to identify blockers (missing footage, assets, or scope expansion).`,
          `  2. Reassign the project if workload rebalancing is required.`,
          `  3. Or approve an updated delivery deadline in the task drawer.`,
          `• Automatic Founder Escalation: If no managerial action, status update, or timeline revision is logged within 24 hours, this issue automatically escalates to all 6 Founders: Pratik, Suraj, Sachin, Uday, Suraj Maurya, and Monu.`,
        ].join("\n"),
        fields: [
          ...baseFields,
          { label: "Escalation Level", value: "Level 2 · Reporting Manager" },
          { label: "Founder Escalation In", value: "24 Hours (if unactioned)" },
        ],
        timelineSteps: buildSmartTimelineSteps("NEXT_DAY_10AM_MANAGER"),
        cta: { label: "🛠️ Open Task to Intervene / Reassign", href: managerTaskUrl },
        secondaryCta: { label: "📅 Update Delivery Deadline", href: managerTaskUrl },
        footer: "TBM Smart Operations Engine · CC'd to assigned editor.",
      }),
      ccList
    );
    return;
  }

  // STAGE 6: 24 Hours After Manager Reminder with No Action → Escalate to ALL 6 FOUNDERS
  if (stage === "FOUNDER_24H_ESCALATION") {
    const founders = await founderUsers();
    const founderEmailSet = new Set<string>([
      ...FOUNDER_EMAILS,
      ...founders.map((f) => f.email),
    ]);
    const managers = await prisma.user.findMany({ where: { role: "MANAGER", active: true } });
    const ccEmails = [
      ...managers.map((m) => m.email),
      ...(assignee?.email ? [assignee.email] : []),
    ];

    for (const f of founders) {
      await notify(
        f.id,
        `🚨 [Founder Escalation · ${p.code}] No Manager Action for 24h on "${p.title}"`,
        `Assignee: ${assignee?.name ?? "Unassigned"} · Manager: ${assignerName} · Founders alerted: Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu.`,
        `/projects?task=${p.id}`
      );
    }
    if (assignee?.active) {
      await notify(
        assignee.id,
        `🚨 [Founders Alerted · ${p.code}] Escalated to Pratik, Suraj, Sachin, Uday, Suraj Maurya & Monu`,
        `No action was taken for 24h after Manager notification on "${p.title}".`,
        `/my-tasks?task=${p.id}`
      );
    }

    await sendMail(
      Array.from(founderEmailSet),
      `🚨 [P0 Founder Escalation · ${p.code}] 24h Inactive Past Manager Alert: "${p.title}"`,
      slackJiraEmailHtml({
        badgeText: "P0 FOUNDER ESCALATION · 24H NO MANAGER ACTION",
        badgeTone: "red",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `P0 Executive Escalation: Zero managerial action taken on overdue deliverable`,
        intro: `To Founders (${FOUNDER_NAMES.join(", ")}), this deliverable missed its internal deadline (${deadlineStr}), passed through all team alerts (T-24h, 10 AM, 6 PM, 8 PM), was escalated to the Reporting Manager (${assignerName}) yesterday at 10:00 AM, and has had ZERO action or updates for over 24 hours.`,
        calloutTitle: "🚨 Executive Studio Intervention Required",
        calloutBody: [
          `• Deliverable: ${p.code} · "${p.title}"`,
          `• Assigned Editor: ${assignee?.name ?? "Unassigned"}`,
          `• Reporting Manager: ${assignerName}`,
          `• Internal Deadline: ${deadlineStr} (Client Air Date: ${clientDueStr})`,
          `• Escalation Reason: 24 hours elapsed since Level 2 Manager Alert with no status update, reassignment, or timeline extension. Immediate leadership reallocation or client communication is necessary.`,
        ].join("\n"),
        fields: [
          ...baseFields,
          { label: "Founders Escalated", value: "Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu" },
          { label: "Escalation Reason", value: "24h elapsed with no manager or editor action post-alert" },
        ],
        timelineSteps: buildSmartTimelineSteps("FOUNDER_24H_ESCALATION"),
        cta: { label: "🚨 Intervene & Reassign Deliverable", href: managerTaskUrl },
        secondaryCta: { label: "📊 Open Studio Dashboard & Timeline", href: `${APP_URL}/home` },
        footer: "TBM Executive Escalation Protocol · Sent to Pratik, Suraj, Sachin, Uday, Suraj Maurya & Monu.",
      }),
      ccEmails
    );
    return;
  }
}

// Assigned To changed or Deadline defined → sends smart Slack/Jira assignment card
export async function onAssigned(p: P, assigner?: { id: string; name: string; email?: string } | null) {
  if (!p.assignee || !p.assignee.active) return;
  const assignerName = assigner?.name || p.createdBy?.name || "Production Manager";
  const assignerId = assigner?.id || p.createdById;

  await sendSmartReminderStage(p, "ASSIGNED", {
    assignerName,
    assignerEmail: assigner?.email,
  });

  // Also confirm to the Manager who assigned it
  if (assignerId && assignerId !== p.assigneeId) {
    await notify(
      assignerId,
      `✅ [Jira · ${p.code}] Assigned to ${p.assignee.name} · Smart Reminders Armed`,
      `Due: ${fmtDate(p.internalDeadline, true) || "Not set"} · Auto-reminders at T-24h, 10 AM, 6 PM, 8 PM → Next Day 10 AM Manager → +24h Founders.`,
      `/projects?task=${p.id}`
    );
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
    `Timer running since ${timeStr}. Standard session limit active.`,
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
        `📊 [${p.code}] Work Progress Report — ${worker.name} logged ${durStr} on "${p.title}"`,
        slackJiraEmailHtml({
          badgeText: "WORK SESSION LOGGED",
          badgeTone: "green",
          issueKey: p.code,
          brandName: p.brand?.name,
          campaignName: p.campaign?.name,
          heading: `${worker.name} logged ${durStr} on "${p.title}"`,
          intro: `A live editing session was completed and logged against this deliverable.`,
          calloutTitle: "Session Notes",
          calloutBody: notes || "Progress logged via TBM Live Timer.",
          fields: [
            { label: "Deliverable", value: `${p.code} · ${p.title}` },
            { label: "Editor", value: worker.name },
            { label: "Duration Logged", value: durStr },
            { label: "Work Type", value: workType || "Assembly Edit" },
            { label: "Current Status", value: p.editStatus },
            { label: "Internal Deadline", value: fmtDate(p.internalDeadline, true) || "—" },
          ],
          cta: { label: "Review Deliverable in Jira Board", href: `${APP_URL}/projects?task=${p.id}` },
        })
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
    slackJiraEmailHtml({
      badgeText: "FIRST CUT READY FOR REVIEW",
      badgeTone: "purple",
      issueKey: p.code,
      brandName: p.brand?.name,
      campaignName: p.campaign?.name,
      heading: `Your first cut of "${p.title}" is ready`,
      intro: `The first cut of "${p.title}" has been shared with you for review. Once you've had a look, please share your feedback in the portal.`,
      cta: { label: "Open Client Review Portal", href: `${APP_URL}/portal` },
      footer: "The Bored Monkey Studio",
    })
  );
}

export async function onRevisionAlert(p: P) {
  const admins = await adminUsers();
  for (const a of admins) await notify(a.id, `Revision round ${p.revisionRound}: ${p.title}`, `${p.brand?.name ?? ""} · ${p.assignee?.name ?? "Unassigned"}`, `/projects?task=${p.id}`);
  await sendMail(
    admins.map((a) => a.email),
    `🔄 [${p.code}] ${p.title} has hit revision round ${p.revisionRound}`,
    slackJiraEmailHtml({
      badgeText: `REVISION ROUND R${p.revisionRound}`,
      badgeTone: "amber",
      issueKey: p.code,
      brandName: p.brand?.name,
      campaignName: p.campaign?.name,
      heading: `Revision Round ${p.revisionRound} on "${p.title}"`,
      intro: "This deliverable is on its third revision or more — flagged for scope and budget tracking.",
      fields: [
        { label: "Brand", value: p.brand?.name ?? "—" },
        { label: "Assigned Editor", value: p.assignee?.name ?? "—" },
        { label: "Revision Round", value: `R${p.revisionRound}` },
        { label: "Edit Status", value: p.editStatus },
      ],
      cta: { label: "Open Deliverable", href: link(p) },
    })
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

// Legacy helper now delegates to the Stage 6 Founder Escalation
export async function alertFoundersOverdue(task: {
  id: string;
  title: string;
  code: string;
  brandName?: string;
  assigneeName?: string;
  overdueHours: number;
}) {
  const full = await prisma.project.findUnique({
    where: { id: task.id },
    include: { brand: true, assignee: true, campaign: true, createdBy: true },
  });
  if (full) {
    await sendSmartReminderStage(full, "FOUNDER_24H_ESCALATION");
  }
}

// When assignee submits a revised timeline with a reason note, notify the assigner
export async function onTimelineRevised(p: P, revisedBy: string, newDate: string, reason: string) {
  const targetUserId = p.createdById && p.createdById !== p.assigneeId ? p.createdById : null;
  const targetUser = targetUserId ? await prisma.user.findUnique({ where: { id: targetUserId } }) : null;

  const subject = `📅 [${p.code}] Revised Timeline Submitted for "${p.title}" (by ${revisedBy})`;

  if (targetUser) {
    await notify(
      targetUser.id,
      `📅 Timeline revised: ${p.title}`,
      `New date: ${newDate} · ${reason}`,
      `/projects?task=${p.id}`
    );
    await sendMail(
      targetUser.email,
      subject,
      slackJiraEmailHtml({
        badgeText: "TIMELINE REVISION REQUEST",
        badgeTone: "purple",
        issueKey: p.code,
        brandName: p.brand?.name,
        campaignName: p.campaign?.name,
        heading: `${revisedBy} proposed a revised deadline for "${p.title}"`,
        intro: `Hi ${targetUser.name.split(" ")[0]}, ${revisedBy} has submitted a revised delivery timeline.`,
        calloutTitle: "Reason for Extension",
        calloutBody: reason,
        fields: [
          { label: "Deliverable", value: `${p.code} · ${p.title}` },
          { label: "Brand", value: p.brand?.name ?? "—" },
          { label: "New Proposed Deadline", value: newDate },
          { label: "Submitted By", value: revisedBy },
        ],
        cta: { label: "Review & Approve in Dashboard", href: `${APP_URL}/projects?task=${p.id}` },
      })
    );
  } else {
    const admins = await adminUsers();
    for (const a of admins) {
      await notify(a.id, `Timeline revised: ${p.title}`, `New date: ${newDate} · ${reason}`, `/projects?task=${p.id}`);
    }
  }
}
