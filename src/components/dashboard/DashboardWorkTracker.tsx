"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Play, Square, Clock, CheckCircle2, ChevronRight, AlertTriangle,
  Sparkles, ExternalLink, Send, ArrowRight, Activity, X
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { JiraIssueTypeIcon, JiraIssueKey, JiraStatusLozenge, JiraEpicPill } from "@/components/jira/JiraBits";
import { startWorkSession, stopWorkSession } from "@/lib/actions";
import { WORK_TYPES } from "@/lib/constants";
import type { TaskDTO } from "@/lib/dto";
import { boardColumn, isDone } from "@/lib/status";
import { cn, fmtDate } from "@/lib/utils";
import { getActiveSession, setActiveSession, formatElapsed, type ActiveSession } from "@/lib/session";

type Props = {
  tasks: TaskDTO[];
  currentUserId: string;
  isManager: boolean;
};

export default function DashboardWorkTracker({ tasks, currentUserId, isManager }: Props) {
  const router = useRouter();
  const [activeSession, setActiveSessionState] = useState<ActiveSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [filterTab, setFilterTab] = useState<"all" | "mine" | "review" | "in_prog">(isManager ? "all" : "mine");

  // Stop & Log Progress Modal State
  const [stopModalTask, setStopModalTask] = useState<TaskDTO | null>(null);
  const [loggedMinutes, setLoggedMinutes] = useState(15);
  const [workType, setWorkType] = useState<string>("Assembly Edit");
  const [progressNotes, setProgressNotes] = useState("");
  const [markSubmitted, setMarkSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync active session from localStorage & update timer every second
  useEffect(() => {
    const sync = () => {
      const s = getActiveSession();
      setActiveSessionState(s);
      if (s) {
        const secs = Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000));
        setElapsedSeconds(secs);
      } else {
        setElapsedSeconds(0);
      }
    };

    sync();
    const interval = setInterval(sync, 1000);
    window.addEventListener("tbm_session_change", sync);
    window.addEventListener("storage", sync);

    return () => {
      clearInterval(interval);
      window.removeEventListener("tbm_session_change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Filter tasks
  const allActive = tasks.filter((t) => !isDone(t));
  const myTasks = allActive.filter((t) => t.assigneeId === currentUserId);
  const needsReview = allActive.filter((t) => boardColumn(t) === "submitted" || boardColumn(t) === "approval");
  const inProgressTasks = allActive.filter(
    (t) => boardColumn(t) === "ongoing" || t.editStatus === "In Progress" || t.startAt
  );

  const displayedTasks =
    filterTab === "mine"
      ? myTasks
      : filterTab === "review"
      ? needsReview
      : filterTab === "in_prog"
      ? inProgressTasks
      : allActive;

  async function handleStartWork(task: TaskDTO) {
    startTransition(async () => {
      try {
        const res = await startWorkSession(task.id);
        const session: ActiveSession = {
          taskId: task.id,
          taskCode: task.code,
          taskTitle: task.title,
          brandName: task.brandName,
          campaignName: task.campaignName,
          workType: task.workType || "Assembly Edit",
          startedAt: Date.now(),
        };
        setActiveSession(session);
        setToastMessage(`Started working on ${task.code}! Manager notified.`);
        setTimeout(() => setToastMessage(null), 4000);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to start session");
      }
    });
  }

  function openStopModal(task: TaskDTO) {
    const mins = Math.max(5, Math.round(elapsedSeconds / 60));
    setLoggedMinutes(mins);
    setWorkType(task.workType || "Assembly Edit");
    setProgressNotes("");
    setMarkSubmitted(false);
    setStopModalTask(task);
  }

  async function handleConfirmStop(e: React.FormEvent) {
    e.preventDefault();
    if (!stopModalTask) return;
    setSubmitting(true);

    try {
      await stopWorkSession({
        projectId: stopModalTask.id,
        durationMinutes: Number(loggedMinutes) || 1,
        workType,
        notes: progressNotes.trim() || undefined,
        markSubmitted,
      });

      setActiveSession(null);
      setStopModalTask(null);
      setToastMessage(`Logged ${loggedMinutes}m on ${stopModalTask.code}! Progress report sent.`);
      setTimeout(() => setToastMessage(null), 4000);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-[12.5px] font-semibold shadow-2xl border border-white/10 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="size-4 text-[#FFE600]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Live Active Session Banner */}
      {activeSession && (
        <div className="relative overflow-hidden rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-rose-600" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Active Work In Progress
                  </span>
                  <span className="rounded bg-amber-200/60 px-1.5 py-0.2 text-[10.5px] font-mono font-bold text-amber-950 dark:bg-amber-900/40 dark:text-amber-200">
                    {activeSession.taskCode}
                  </span>
                </div>
                <h4 className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                  {activeSession.taskTitle}
                </h4>
                <div className="flex items-center gap-2 text-[11.5px] text-slate-600 dark:text-slate-400 mt-0.5">
                  {activeSession.brandName && <span>{activeSession.brandName}</span>}
                  {activeSession.campaignName && (
                    <span>· {activeSession.campaignName}</span>
                  )}
                  {activeSession.workType && <span>· {activeSession.workType}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Timer Display */}
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 shadow-2xs dark:border-amber-800/80 dark:bg-[#161B22]">
                <Clock className="size-4 text-amber-600 animate-spin" style={{ animationDuration: "3s" }} />
                <span className="font-mono text-[16px] font-bold tabular-nums text-slate-950 dark:text-white">
                  {formatElapsed(elapsedSeconds)}
                </span>
              </div>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={() => {
                  const t = tasks.find((x) => x.id === activeSession.taskId) || {
                    id: activeSession.taskId,
                    code: activeSession.taskCode,
                    title: activeSession.taskTitle,
                    workType: activeSession.workType,
                  } as TaskDTO;
                  openStopModal(t);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
              >
                <Square className="size-3.5 fill-current" />
                <span>Stop Working & Log Progress</span>
              </button>

              <Link
                href={`${isManager ? "/projects" : "/my-tasks"}?task=${activeSession.taskId}`}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 shadow-2xs"
              >
                <span>Task Details</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Deliverables Command Center with Filter Tabs */}
      <div className="rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]">
        {/* Header Strip with Segmented Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-stone-100 bg-[#FAF9F5]/50 px-3.5 py-2 dark:border-[#2C3B53] dark:bg-[#0F141C] gap-2">
          <div className="flex items-center gap-1 overflow-x-auto scroll-thin">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition shrink-0 cursor-pointer",
                filterTab === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              All Studio ({allActive.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("mine")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition shrink-0 cursor-pointer",
                filterTab === "mine"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              My Tasks ({myTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("in_prog")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition shrink-0 cursor-pointer",
                filterTab === "in_prog"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              In Progress ({inProgressTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("review")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition shrink-0 cursor-pointer",
                filterTab === "review"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              Needs Review ({needsReview.length})
            </button>
          </div>

          <Link
            href={isManager ? "/projects" : "/my-tasks"}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            View all →
          </Link>
        </div>

        {displayedTasks.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-slate-400">
            {filterTab === "mine"
              ? "No open deliverables assigned to you right now. You are all caught up!"
              : filterTab === "review"
              ? "No deliverables currently awaiting review."
              : filterTab === "in_prog"
              ? "No deliverables currently in progress."
              : "No active deliverables found."}
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
            {displayedTasks.slice(0, 10).map((t) => {
              const isCurrentSession = activeSession?.taskId === t.id;
              const hasOtherSession = Boolean(activeSession && activeSession.taskId !== t.id);
              const isMyTask = t.assigneeId === currentUserId;
              const hrsLogged = ((t.totalDurationMinutes || 0) / 60).toFixed(1);

              return (
                <div
                  key={t.id}
                  className={cn(
                    "grid grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3.5 py-2.5 transition",
                    isCurrentSession
                      ? "bg-amber-50/70 dark:bg-amber-950/20"
                      : "hover:bg-slate-50/80 dark:hover:bg-[#0F141C]"
                  )}
                >
                  {/* Col 1: Type icon & Key */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <JiraIssueTypeIcon type={t.type} />
                    <JiraIssueKey code={t.code} />
                  </div>

                  {/* Col 2: Title & Context pills */}
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link
                        href={`${isManager ? "/projects" : "/my-tasks"}?task=${t.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 hover:underline truncate dark:text-white text-[12.5px]"
                        title={t.title}
                      >
                        {t.title}
                      </Link>
                      {t.campaignName && (
                        <span className="hidden sm:inline shrink-0">
                          <JiraEpicPill name={t.campaignName} color={t.brandColor} />
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400 mt-0.5">
                      {t.brandName && (
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {t.brandName}
                        </span>
                      )}
                      {t.assigneeName ? (
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          · <Avatar name={t.assigneeName} size={13} />
                          <span>{t.assigneeName}</span>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          · Unassigned
                        </span>
                      )}
                      {t.internalDeadline && <span>· Due {fmtDate(t.internalDeadline)}</span>}
                      {t.totalDurationMinutes > 0 && <span>· {hrsLogged}h logged</span>}
                    </div>
                  </div>

                  {/* Col 3: Status & Action button */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <JiraStatusLozenge boardKey={boardColumn(t)} />

                    {isCurrentSession ? (
                      <button
                        type="button"
                        onClick={() => openStopModal(t)}
                        className="h-6 px-2.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10.5px] inline-flex items-center gap-1 shadow-2xs transition animate-pulse cursor-pointer shrink-0"
                      >
                        <Square className="size-2.5 fill-current" />
                        <span>Stop ({formatElapsed(elapsedSeconds)})</span>
                      </button>
                    ) : isMyTask ? (
                      <button
                        type="button"
                        disabled={hasOtherSession || isPending}
                        onClick={() => handleStartWork(t)}
                        className={cn(
                          "h-6 px-2.5 rounded font-semibold text-[10.5px] inline-flex items-center gap-1 shadow-2xs transition cursor-pointer shrink-0",
                          hasOtherSession
                            ? "bg-stone-100 text-slate-400 dark:bg-white/5 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        )}
                        title={hasOtherSession ? "Another task is active" : "Start work session and track hours"}
                      >
                        <Play className="size-2 fill-current" />
                        <span>Start</span>
                      </button>
                    ) : (
                      <Link
                        href={`/projects?task=${t.id}`}
                        className="text-[11px] font-semibold text-slate-400 hover:text-blue-600 transition px-1"
                        title="View deliverable"
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Stop Work Session & Log Progress Modal */}
      {stopModalTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setStopModalTask(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-[#2C3B53] dark:bg-[#161B22]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-amber-600" />
                <h3 className="text-[15px] font-bold text-ink">
                  Log Work Session · {stopModalTask.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStopModalTask(null)}
                className="rounded p-1 text-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmStop} className="mt-4 space-y-3.5">
              <div className="rounded-lg bg-canvas p-2.5 border border-line text-[12px]">
                <div className="font-semibold text-ink">{stopModalTask.title}</div>
                <div className="text-muted text-[11px] mt-0.5">
                  {stopModalTask.brandName} {stopModalTask.campaignName && `· ${stopModalTask.campaignName}`}
                </div>
              </div>

              {/* Duration in Minutes */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Duration Tracked (Minutes) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    required
                    value={loggedMinutes}
                    onChange={(e) => setLoggedMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="field-input w-28 font-mono text-[13px] font-bold text-center"
                  />
                  <span className="text-[12px] text-muted font-medium">
                    ({(loggedMinutes / 60).toFixed(1)} hours)
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {[15, 30, 60, 120].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLoggedMinutes(m)}
                        className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] font-semibold text-muted hover:text-ink hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        {m < 60 ? `${m}m` : `${m / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Work Type */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Work Type Performed *
                </label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="field-input w-full text-[12.5px] font-medium"
                >
                  {WORK_TYPES.map((wt) => (
                    <option key={wt} value={wt}>
                      {wt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Progress Notes */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Progress Report Notes (Sent to Assigner / Manager)
                </label>
                <textarea
                  rows={3}
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  placeholder="e.g. Cut first 45 seconds, matched B-roll hooks, audio synced with tempo. Ready for review."
                  className="field-input w-full text-[12.5px] py-1.5 leading-relaxed resize-none"
                />
              </div>

              {/* Mark as Submitted Checkbox */}
              <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 p-2.5 text-[12px] cursor-pointer hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={markSubmitted}
                  onChange={(e) => setMarkSubmitted(e.target.checked)}
                  className="size-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-ink">
                  Deliverable ready — mark as Submitted for approval
                </span>
              </label>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setStopModalTask(null)}
                  className="btn-ghost py-1.5 px-3 text-[12px]"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loggedMinutes <= 0}
                  className="btn-primary py-1.5 px-4 text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="size-3.5" />
                  <span>{submitting ? "Logging..." : "Submit Progress & Send Report"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

