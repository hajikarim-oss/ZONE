"use client";

import { BellRing, CheckCircle2, Eye, Play, Send, ShieldAlert, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import {
  runAutomationsNow,
  sendTestEmail,
  triggerSmartReminderStageAction,
} from "@/lib/actions";
import type { SmartReminderStage } from "@/lib/notify";
import { cn } from "@/lib/utils";

export default function RunNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          if (!confirm("Run the daily automations now? This sends the real reminder emails and notifications.")) return;
          setMsg(null);
          start(async () => {
            try {
              const r = await runAutomationsNow();
              setMsg(`Done: ${r.reminders} reminders, ${r.deadlineAlerts} deadline alerts, ${r.escalated} escalations, ${r.brandNudges} brand nudges`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
      >
        <Play className="h-3.5 w-3.5" /> {pending ? "Running…" : "Run now"}
      </button>
    </div>
  );
}

export function TestEmailButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn-outline py-1 text-[12px]"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await sendTestEmail();
              setMsg({ ok: r.ok, text: r.message });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
            }
          })
        }
      >
        <Send className="h-3 w-3" /> {pending ? "Sending…" : "Send test email"}
      </button>
      {msg && <span className={msg.ok ? "text-emerald-700" : "text-rose-600"}>{msg.text}</span>}
    </span>
  );
}

const STAGE_META: {
  stage: SmartReminderStage;
  step: string;
  title: string;
  recipient: string;
  tone: string;
  badgeBg: string;
  callout: string;
  ctaPrimary: string;
  ctaSecondary: string;
}[] = [
  {
    stage: "ASSIGNED",
    step: "Step 0 · On Assignment",
    title: "Manager Assigns Work & Defines Deadline",
    recipient: "Team Member (Assignee)",
    tone: "#0052CC",
    badgeBg: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
    callout: "Manager defines the internal deadline. Team member receives the full creative brief, drive info, and armed reminder schedule.",
    ctaPrimary: "🚀 Open Task & Start Timer",
    ctaSecondary: "📅 View Schedule in Board",
  },
  {
    stage: "BEFORE_24H",
    step: "Step 1 · T - 24 Hours",
    title: "24 Hours Before Deadline Check-In",
    recipient: "Team Member (Assignee)",
    tone: "#FF991F",
    badgeBg: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    callout: "24 hours remaining before deadline. Team member is prompted to click 'Confirm On Track' or request an extension with a reason note.",
    ctaPrimary: "✅ Confirm On Track",
    ctaSecondary: "📅 Request Deadline Extension",
  },
  {
    stage: "DEADLINE_10AM",
    step: "Step 2 · Due Day 10:00 AM",
    title: "Deadline Day 10:00 AM Morning Kickoff",
    recipient: "Team Member (Assignee)",
    tone: "#FF991F",
    badgeBg: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    callout: "Sent at 10:00 AM on the day of the deadline. Prompts editor to start live session timer and outlines the 6:00 PM → 8:00 PM check-in window.",
    ctaPrimary: "▶️ Start Live Session & Update Status",
    ctaSecondary: "📝 Post Morning Standup",
  },
  {
    stage: "DEADLINE_6PM",
    step: "Step 3 · Due Day 6:00 PM",
    title: "Deadline Day 6:00 PM Evening Window Check-In",
    recipient: "Team Member (Assignee)",
    tone: "#FF5630",
    badgeBg: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
    callout: "Sent at 6:00 PM on deadline day. Warns that the 6:00 PM – 8:00 PM activity watchdog is active and requires cut submission or progress update before 8:00 PM.",
    ctaPrimary: "📤 Submit Cut / Update Progress Now",
    ctaSecondary: "📅 Request Timeline Revision",
  },
  {
    stage: "DEADLINE_8PM_NO_CHANGE",
    step: "Step 4 · Due Day 8:00 PM",
    title: "8:00 PM No-Change Watchdog Alert (Nothing Changed 6 PM – 8 PM)",
    recipient: "Team Member (Assignee)",
    tone: "#DE350B",
    badgeBg: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    callout: "Fires at 8:00 PM if zero activity/status change occurred between 6:00 PM and 8:00 PM. Final warning before tomorrow's 10:00 AM Manager Escalation.",
    ctaPrimary: "⚡ Post Progress Update Now",
    ctaSecondary: "📅 Propose New Deadline",
  },
  {
    stage: "NEXT_DAY_10AM_MANAGER",
    step: "Step 5 · Next Morning 10:00 AM",
    title: "Next Morning 10:00 AM Reporting Manager Escalation",
    recipient: "Reporting Manager + Assignee (CC)",
    tone: "#FF5630",
    badgeBg: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
    callout: "Sent at 10:00 AM the morning after the missed deadline. Gives the Reporting Manager a 24-hour action window before Founder Escalation.",
    ctaPrimary: "🛠️ Take Manager Action / Reassign",
    ctaSecondary: "📅 Update Deadline in Drawer",
  },
  {
    stage: "FOUNDER_24H_ESCALATION",
    step: "Step 6 · +24h No Manager Action",
    title: "P0 Founder Escalation (24h After Manager Alert with No Action)",
    recipient: "All 6 Founders: Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu",
    tone: "#DE350B",
    badgeBg: "bg-rose-600 text-white",
    callout: "If no action is taken by the Manager within 24 hours of the 10:00 AM Manager Alert, all 6 Founders (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu) receive this executive P0 escalation.",
    ctaPrimary: "🚨 Intervene & Reassign Deliverable",
    ctaSecondary: "📊 Open Live Studio Timeline",
  },
];

export function SmartReminderSimulator({
  tasks,
}: {
  tasks: {
    id: string;
    code: string;
    title: string;
    brandName: string;
    campaignName: string;
    assigneeName: string;
    assignerName: string;
    deadline: string;
    status: string;
    priority: string;
  }[];
}) {
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id || "");
  const [selectedStage, setSelectedStage] = useState<SmartReminderStage>("BEFORE_24H");
  const [pending, start] = useTransition();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const task = tasks.find((t) => t.id === selectedTaskId) || tasks[0];
  const meta = STAGE_META.find((m) => m.stage === selectedStage) || STAGE_META[1];

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#0052CC]/10 px-2 py-0.5 text-[11px] font-bold text-[#0052CC]">
              <Sparkles className="h-3 w-3" /> Slack × Jira Smart Reminder Engine
            </span>
            <h3 className="text-[16px] font-bold text-ink">
              Interactive Escalation Pipeline & Live Card Preview
            </h3>
          </div>
          <p className="text-[12px] text-muted mt-0.5">
            Preview and test any of the 7 smart reminder stages — from Manager Assignment → T-24h → 10 AM → 6 PM → 8 PM Watchdog → Next Day 10 AM Manager → +24h Founders (Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            className="field-input text-[12.5px] py-1.5 max-w-[260px]"
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.title} ({t.assigneeName})
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={pending || !task}
            onClick={() => {
              if (!task) return;
              setStatusMsg(null);
              start(async () => {
                try {
                  const res = await triggerSmartReminderStageAction(task.id, selectedStage);
                  setStatusMsg(res.message);
                } catch (err) {
                  setStatusMsg(err instanceof Error ? err.message : "Failed to trigger stage");
                }
              });
            }}
            className="btn-primary text-[12px] py-1.5 px-3.5 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Sending..." : `Send [${meta.step.split("·")[0].trim()}] Now`}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-[12.5px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 7-Stage Pipeline Selector Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
        {STAGE_META.map((s) => {
          const active = s.stage === selectedStage;
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => setSelectedStage(s.stage)}
              className={cn(
                "rounded-lg border p-2.5 text-left transition cursor-pointer flex flex-col justify-between gap-1.5",
                active
                  ? "border-[#0052CC] bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-[#0052CC]"
                  : "border-line bg-canvas/40 hover:border-slate-300"
              )}
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#0052CC]">
                {s.step}
              </span>
              <span className="text-[11.5px] font-bold text-ink leading-snug line-clamp-2">
                {s.title}
              </span>
              <span className="text-[10px] text-muted truncate">{s.recipient}</span>
            </button>
          );
        })}
      </div>

      {/* Live Slack × Jira Notification Card Preview */}
      {task && (
        <div
          className="rounded-lg border border-line bg-white dark:bg-[#161B22] shadow-sm overflow-hidden"
          style={{ borderTop: `5px solid ${meta.tone}` }}
        >
          <div className="px-5 py-3 bg-canvas/60 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11.5px]">
              <span className="font-extrabold tracking-wider uppercase text-[#0052CC]">
                TBM STUDIO · JIRA & SLACK OPS
              </span>
              <span className="font-mono font-bold bg-slate-200/80 dark:bg-white/10 px-1.5 py-0.5 rounded text-ink">
                {task.code}
              </span>
              <span className="text-muted font-medium">
                / {task.brandName} · {task.campaignName}
              </span>
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider", meta.badgeBg)}>
              {meta.step}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <div className="text-[11px] font-semibold text-muted mb-1">
                To: <strong className="text-ink">{meta.recipient}</strong>
              </div>
              <h4 className="text-[17px] font-bold text-ink">
                {meta.title} — &ldquo;{task.title}&rdquo;
              </h4>
            </div>

            <div
              className="rounded-r-md p-3 text-[12.5px] text-ink bg-canvas/60"
              style={{ borderLeft: `4px solid ${meta.tone}` }}
            >
              <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted mb-1">
                Slack × Jira Automated Trigger Rule
              </div>
              {meta.callout}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-line bg-canvas/30 p-3 text-[12px]">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Issue Key & Deliverable</div>
                <div className="font-semibold text-ink truncate">{task.code} · {task.title}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Brand / Campaign</div>
                <div className="font-semibold text-ink truncate">{task.brandName} · {task.campaignName}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Assigned Team Member</div>
                <div className="font-semibold text-ink">{task.assigneeName}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Assigned By (Manager)</div>
                <div className="font-semibold text-ink">{task.assignerName}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Defined Deadline</div>
                <div className="font-semibold text-ink">{task.deadline}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Founders Escalation Roster</div>
                <div className="font-semibold text-ink">Pratik, Suraj, Sachin, Uday, Suraj Maurya, Monu</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
              <span
                className="px-3.5 py-1.5 rounded text-[12px] font-bold text-white"
                style={{ backgroundColor: meta.tone }}
              >
                {meta.ctaPrimary}
              </span>
              <span className="px-3 py-1.5 rounded border border-line bg-canvas text-[12px] font-semibold text-ink">
                {meta.ctaSecondary}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
