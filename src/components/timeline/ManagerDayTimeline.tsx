"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Plus, UserCheck, AlertCircle, ArrowRightLeft, Check, Sparkles, MessageSquare, CheckCircle2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import { updateTask } from "@/lib/actions";
import type { TaskDTO, PersonDTO } from "@/lib/dto";
import { cn, fmtDate } from "@/lib/utils";
import { BOARD_COLUMNS, boardColumn, isDone } from "@/lib/status";

const TIMELINE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function formatHourLabel(h: number) {
  if (h === 12) return "12 PM";
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

type Props = {
  people: PersonDTO[];
  tasks: TaskDTO[];
};

export default function ManagerDayTimeline({ people, tasks }: Props) {
  const [hoveredCell, setHoveredCell] = useState<{ personId: string; hour: number } | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [dismissedDefault, setDismissedDefault] = useState(false);
  const [selectedTaskForReassign, setSelectedTaskForReassign] = useState<TaskDTO | null>(null);
  const [targetAssigneeId, setTargetAssigneeId] = useState<string>("");
  const [quickAssignPerson, setQuickAssignPerson] = useState<PersonDTO | null>(null);
  const [quickAssignTaskId, setQuickAssignTaskId] = useState<string>("");
  const [selectedMemberView, setSelectedMemberView] = useState<PersonDTO | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Active tasks for today
  const activeTasks = tasks.filter((t) => !isDone(t));
  const unassignedOrUrgent = activeTasks.filter((t) => !t.assigneeId || t.priority === "urgent" || t.priority === "high");

  // Determine what each person is doing hour-by-hour (9 AM to 9 PM)
  function getPersonHourTask(personId: string, hour: number): TaskDTO | null {
    const personTasks = activeTasks.filter((t) => t.assigneeId === personId);
    if (!personTasks.length) return null;

    // Check if any task has startAt/endAt covering this hour
    for (const task of personTasks) {
      if (task.startAt) {
        const start = new Date(task.startAt);
        const end = task.endAt ? new Date(task.endAt) : new Date(start.getTime() + 4 * 60 * 60 * 1000);
        const startH = start.getHours();
        const endH = end.getHours() || 21;
        if (hour >= startH && hour <= endH) return task;
      }
    }

    // Fallback: spread active tasks across standard workday (e.g. 1st task covers 9-13, 2nd task covers 14-18, etc.)
    const slotIndex = hour < 14 ? 0 : hour < 18 ? 1 : 2;
    if (personTasks[slotIndex]) return personTasks[slotIndex];
    if (personTasks[0] && hour >= 10 && hour <= 19) return personTasks[0];

    return null;
  }

  function handleReassign(task: TaskDTO, newAssigneeId: string) {
    if (!newAssigneeId || newAssigneeId === task.assigneeId) return;
    startTransition(async () => {
      try {
        await updateTask(task.id, { assigneeId: newAssigneeId });
        setStatusMessage(`Reassigned "${task.title}" to ${people.find((p) => p.id === newAssigneeId)?.name}`);
        setSelectedTaskForReassign(null);
        setTimeout(() => setStatusMessage(null), 3500);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to reassign task");
      }
    });
  }

  function handleQuickAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAssignPerson || !quickAssignTaskId) return;
    const task = activeTasks.find((t) => t.id === quickAssignTaskId);
    if (!task) return;

    startTransition(async () => {
      try {
        await updateTask(task.id, { assigneeId: quickAssignPerson.id });
        setStatusMessage(`Assigned "${task.title}" to ${quickAssignPerson.name}`);
        setQuickAssignPerson(null);
        setQuickAssignTaskId("");
        setTimeout(() => setStatusMessage(null), 3500);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to assign task");
      }
    });
  }

  const defaultHour = () => {
    const nowH = new Date().getHours();
    return nowH >= 9 && nowH <= 21 ? nowH : 14;
  };
  const activeHourOverview = hoveredHour ?? hoveredCell?.hour ?? (dismissedDefault ? null : defaultHour());

  // Metrics for active hour overview
  const snapshotTasks = activeHourOverview !== null
    ? people.map((p) => ({ person: p, task: getPersonHourTask(p.id, activeHourOverview) }))
    : [];
  const freeMembers = snapshotTasks.filter((x) => !x.task);
  const workingNowMembers = snapshotTasks.filter(
    (x) => x.task && (x.task.editStatus === "In Progress" || (x.task.startAt && !x.task.endAt))
  );
  const loggedHoursMembers = snapshotTasks.filter(
    (x) =>
      x.task &&
      x.task.totalDurationMinutes > 0 &&
      !(x.task.editStatus === "In Progress" || (x.task.startAt && !x.task.endAt))
  );
  const notStartedMembers = snapshotTasks.filter(
    (x) =>
      x.task &&
      !x.task.startAt &&
      x.task.totalDurationMinutes === 0 &&
      x.task.editStatus !== "In Progress"
  );

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-ink">Manager Live Day Timeline</h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              9 AM – 9 PM
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            Hourly team allocation & real-time work status. Hover any hour header (e.g. 2 PM) to inspect team progress, track working hours, and review daily updates.
          </p>
        </div>

        {statusMessage && (
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Hour Snapshot / Team State for Active Hour */}
      {activeHourOverview !== null && (
        <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-[12px] animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between border-b border-accent/20 pb-2.5 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
              <span className="font-bold text-ink text-[13px]">
                {formatHourLabel(activeHourOverview)} Team Snapshot
              </span>
              <span className="text-[11px] text-muted font-medium">
                ({freeMembers.length} free / {people.length} total)
              </span>

              {/* Real-time status breakdown chips */}
              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                {workingNowMembers.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {workingNowMembers.length} Working Now
                  </span>
                )}
                {notStartedMembers.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    ⏳ {notStartedMembers.length} Not Started
                  </span>
                )}
                {loggedHoursMembers.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                    ✓ {loggedHoursMembers.length} Logged Today
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setHoveredHour(null);
                setHoveredCell(null);
                setDismissedDefault(true);
              }}
              className="text-[11px] font-medium text-muted hover:text-ink transition"
            >
              Clear focus
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {people.map((p) => {
              const currentTask = getPersonHourTask(p.id, activeHourOverview);
              const isWorkingNow = Boolean(
                currentTask &&
                  (currentTask.editStatus === "In Progress" ||
                    (currentTask.startAt && !currentTask.endAt))
              );
              const hasHours = Boolean(currentTask && currentTask.totalDurationMinutes > 0);

              return (
                <div
                  key={p.id}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-lg border p-2.5 transition shadow-2xs",
                    currentTask
                      ? isWorkingNow
                        ? "border-amber-300/80 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20"
                        : hasHours
                        ? "border-blue-200 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-950/10"
                        : "border-line bg-surface hover:border-slate-300 dark:hover:border-slate-700"
                      : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                  )}
                >
                  {/* Top: Member name (CLICKABLE per Point 5), avatar & live status */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberView(p)}
                      className="flex items-center gap-2 min-w-0 text-left group/member cursor-pointer"
                      title={`Click to open ${p.name}'s individual tasks, live work & logged time`}
                    >
                      <Avatar name={p.name} size={22} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink text-[12px] group-hover/member:text-[#0052CC] group-hover/member:underline transition-colors">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-muted truncate">{p.department || "Editor"}</div>
                      </div>
                    </button>

                    {currentTask ? (
                      <div className="shrink-0 flex items-center gap-1">
                        {isWorkingNow ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 dark:text-amber-400">
                            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Working Now
                          </span>
                        ) : hasHours ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-blue-700 dark:text-blue-400">
                            ⏱️ {(currentTask.totalDurationMinutes / 60).toFixed(1)}h logged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-stone-100 dark:bg-white/10 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500">
                            ⏳ Not Started
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAssignPerson(p);
                          setQuickAssignTaskId(unassignedOrUrgent[0]?.id || activeTasks[0]?.id || "");
                        }}
                        className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 transition"
                        title={`Assign urgent task to ${p.name}`}
                      >
                        + Pull
                      </button>
                    )}
                  </div>

                  {/* Deliverable Details & Daily Progress Sync */}
                  {currentTask ? (
                    <div className="mt-2 pt-1.5 border-t border-line/60 space-y-1">
                      <div
                        onClick={() => {
                          setSelectedTaskForReassign(currentTask);
                          setTargetAssigneeId("");
                        }}
                        className="cursor-pointer group/title"
                        title="Click to view telemetry, comments, and reassign"
                      >
                        <div className="truncate text-[11px] font-medium text-ink group-hover/title:text-accent transition-colors">
                          {currentTask.brandName ? (
                            <span className="font-normal text-muted">[{currentTask.brandName}] </span>
                          ) : null}
                          {currentTask.title}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span className="truncate max-w-[140px]">
                          {currentTask.workType || currentTask.type || "Active"} ·{" "}
                          {BOARD_COLUMNS.find((c) => c.key === boardColumn(currentTask))?.label ||
                            "Ongoing"}
                        </span>

                        {currentTask.commentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-slate-500 hover:text-ink font-mono font-medium">
                            <MessageSquare className="size-2.5" /> {currentTask.commentCount}
                          </span>
                        )}
                      </div>

                      {/* Latest comment / standup update sync */}
                      {currentTask.latestUpdate && (
                        <div className="mt-1 line-clamp-1 rounded bg-canvas/80 px-1.5 py-0.5 text-[9.5px] text-slate-600 dark:text-slate-400 italic border border-line/40">
                          <span className="font-semibold not-italic text-ink">
                            {currentTask.latestUpdate.authorName.split(" ")[0]}:{" "}
                          </span>
                          {currentTask.latestUpdate.body}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Available (Free)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Unassigned / Urgent Drawer */}
      {unassignedOrUrgent.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-2.5 text-[12px]">
          <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" /> Urgent & Unassigned ({unassignedOrUrgent.length}):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {unassignedOrUrgent.slice(0, 4).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 shadow-sm"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: t.brandColor || "#6366f1" }} />
                <span className="max-w-[160px] truncate font-medium text-ink">{t.title}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaskForReassign(t);
                    setTargetAssigneeId("");
                  }}
                  className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent hover:text-white transition"
                >
                  Pull Editor
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline Grid */}
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[850px]">
          {/* Header Row: Hours */}
          <div className="grid grid-cols-[180px_repeat(13,1fr)] items-center border-b border-line bg-canvas/70 text-[11px] font-medium text-muted rounded-t-lg">
            <div className="p-2 pl-3">Team Member</div>
            {TIMELINE_HOURS.map((h) => {
              const isColActive = activeHourOverview === h;
              return (
                <div
                  key={h}
                  onMouseEnter={() => setHoveredHour(h)}
                  className={cn(
                    "cursor-pointer border-l border-line/60 p-2 text-center transition",
                    isColActive ? "bg-accent/15 text-accent font-semibold" : "hover:bg-line/40 hover:text-ink"
                  )}
                  title={`View all team members at ${formatHourLabel(h)}`}
                >
                  {formatHourLabel(h)}
                </div>
              );
            })}
          </div>

          {/* Member Rows */}
          <div className="divide-y divide-line/60 border-b border-line">
            {people.map((p) => {
              const activeCount = activeTasks.filter((t) => t.assigneeId === p.id).length;
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-[180px_repeat(13,1fr)] items-center transition hover:bg-canvas/40"
                >
                  {/* Person Col (CLICKABLE per Point 5) */}
                  <div className="flex items-center justify-between p-2 pl-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberView(p)}
                      className="flex items-center gap-2 min-w-0 text-left group/rowmember cursor-pointer"
                      title={`Open ${p.name}'s individual tasks, live session & logged hours`}
                    >
                      <Avatar name={p.name} size={24} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink group-hover/rowmember:text-[#0052CC] group-hover/rowmember:underline transition-colors">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-muted">{p.department || "Editor"}</div>
                      </div>
                    </button>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        activeCount === 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                          : activeCount > 2
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
                      )}
                      title={`${activeCount} active tasks`}
                    >
                      {activeCount === 0 ? "Free" : `${activeCount} task${activeCount > 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {/* 13 Hour slots */}
                  {TIMELINE_HOURS.map((hour) => {
                    const task = getPersonHourTask(p.id, hour);
                    const prevTask = hour > 9 ? getPersonHourTask(p.id, hour - 1) : null;
                    const nextTask = hour < 21 ? getPersonHourTask(p.id, hour + 1) : null;
                    const isSameAsPrev = !!task && prevTask?.id === task.id;
                    const isSameAsNext = !!task && nextTask?.id === task.id;
                    const isHovered = hoveredCell?.personId === p.id && hoveredCell?.hour === hour;
                    const isColumnFocused = activeHourOverview === hour;
                    const tooltipAlign = hour <= 11 ? "left-0 translate-x-0" : hour >= 19 ? "right-0 left-auto translate-x-0" : "left-1/2 -translate-x-1/2";

                    return (
                      <div
                        key={hour}
                        onMouseEnter={() => setHoveredCell({ personId: p.id, hour })}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={cn(
                          "relative h-12 border-l border-line/50 p-0.5 flex items-center justify-center transition",
                          isColumnFocused && "bg-accent/5",
                          task ? "hover:bg-accent/10" : "hover:bg-canvas/80",
                        )}
                      >
                        {task ? (
                          <div
                            onClick={() => {
                              setSelectedTaskForReassign(task);
                              setTargetAssigneeId("");
                            }}
                            className={cn(
                              "group/task relative flex h-full w-full cursor-pointer flex-col justify-center px-1.5 text-left transition hover:brightness-95",
                              !isSameAsPrev && !isSameAsNext && "rounded-md",
                              !isSameAsPrev && isSameAsNext && "rounded-l-md rounded-r-none border-r-0",
                              isSameAsPrev && isSameAsNext && "rounded-none border-x-0",
                              isSameAsPrev && !isSameAsNext && "rounded-r-md rounded-l-none border-l-0"
                            )}
                            style={{
                              backgroundColor: `${task.brandColor || "#6366f1"}20`,
                              borderLeft: !isSameAsPrev ? `3px solid ${task.brandColor || "#6366f1"}` : undefined,
                            }}
                          >
                            {!isSameAsPrev ? (
                              <>
                                <span className="truncate text-[10px] font-semibold leading-tight text-ink">
                                  {task.title}
                                </span>
                                <span className="truncate text-[9px] text-muted">
                                  {task.workType || task.type || "Active"}
                                </span>
                              </>
                            ) : (
                              <div className="flex items-center justify-center w-full px-1">
                                <span className="h-1 w-full rounded-full opacity-40" style={{ background: task.brandColor || "#6366f1" }} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickAssignPerson(p);
                              setQuickAssignTaskId(unassignedOrUrgent[0]?.id || activeTasks[0]?.id || "");
                            }}
                            className="h-full w-full rounded border border-dashed border-line/50 text-[10px] text-muted/60 opacity-0 transition hover:border-accent hover:text-accent hover:opacity-100 flex items-center justify-center"
                            title={`Pull ${p.name} onto a task`}
                          >
                            + Pull
                          </button>
                        )}

                        {/* Interactive Tooltip with smart edge alignment */}
                        {isHovered && (
                          <div
                            className={cn(
                              "pointer-events-none absolute bottom-full z-40 mb-1.5 w-64 rounded-lg border border-line bg-surface p-2.5 text-[11px] shadow-lg",
                              tooltipAlign
                            )}
                          >
                            <div className="flex items-center justify-between border-b border-line/60 pb-1.5 font-semibold text-ink">
                              <span>{formatHourLabel(hour)} Slot</span>
                              <span className="text-muted font-normal">{p.name}</span>
                            </div>

                            {task ? (
                              <div className="mt-1.5 space-y-1.5">
                                <div className="font-semibold text-ink line-clamp-1">{task.title}</div>
                                <div className="text-muted flex items-center gap-1">
                                  <span>Brand:</span>
                                  <strong className="text-ink">{task.brandName || "—"}</strong>
                                  {task.campaignName && <span>· {task.campaignName}</span>}
                                </div>

                                {/* Live Daily Progress Telemetry */}
                                <div className="flex items-center justify-between text-[10px] pt-0.5">
                                  {task.editStatus === "In Progress" || (task.startAt && !task.endAt) ? (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20">
                                      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> Working Now
                                    </span>
                                  ) : task.totalDurationMinutes > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                                      ⏱️ {(task.totalDurationMinutes / 60).toFixed(1)}h logged
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-slate-500 bg-stone-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                      ⏳ Not Started
                                    </span>
                                  )}

                                  {task.commentCount > 0 && (
                                    <span className="text-muted flex items-center gap-1">
                                      <MessageSquare className="size-2.5" /> {task.commentCount}
                                    </span>
                                  )}
                                </div>

                                {/* Latest comment / standup update sync */}
                                {task.latestUpdate && (
                                  <div className="rounded bg-canvas/60 p-1.5 text-[10px] text-slate-600 dark:text-slate-300 border border-line/50">
                                    <span className="font-semibold text-ink">{task.latestUpdate.authorName.split(" ")[0]}: </span>
                                    <span className="line-clamp-2 italic">"{task.latestUpdate.body}"</span>
                                  </div>
                                )}

                                <div className="pt-1 text-[10px] text-accent font-medium flex items-center justify-between border-t border-line/40">
                                  <span>Click to view telemetry & reassign</span>
                                  {task.internalDeadline && (
                                    <span className="text-muted">Due {fmtDate(task.internalDeadline)}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-1.5 text-emerald-600 dark:text-emerald-400">
                                <div>✓ Editor is available</div>
                                <div className="text-[10px] text-muted mt-0.5">Click + Pull to assign an urgent video</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Deliverable Telemetry & Reassignment */}
      {selectedTaskForReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-pop">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-accent" />
                <h3 className="text-[15px] font-semibold text-ink">Deliverable Telemetry & Management</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskForReassign(null)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-[13px]">
              {/* Header Box */}
              <div className="rounded-lg bg-canvas p-3 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-accent">{selectedTaskForReassign.code}</span>
                  <span className="text-[11px] font-medium text-muted">
                    {selectedTaskForReassign.brandName || "General"}
                    {selectedTaskForReassign.campaignName ? ` · ${selectedTaskForReassign.campaignName}` : ""}
                  </span>
                </div>
                <p className="font-semibold text-ink text-[14px] mt-1">{selectedTaskForReassign.title}</p>
                <div className="text-[11px] text-muted mt-0.5">
                  Type: {selectedTaskForReassign.workType || selectedTaskForReassign.type || "Deliverable"}
                </div>
              </div>

              {/* Real-time Work Status & Daily Progress Telemetry */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">
                    Daily Progress Telemetry
                  </span>
                  {selectedTaskForReassign.editStatus === "In Progress" ||
                  (selectedTaskForReassign.startAt && !selectedTaskForReassign.endAt) ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Working Now (Live)
                    </span>
                  ) : selectedTaskForReassign.totalDurationMinutes > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                      ⏱️ {(selectedTaskForReassign.totalDurationMinutes / 60).toFixed(1)}h Logged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-stone-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      ⏳ Not Started Yet
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-line/40">
                  <div>
                    <span className="text-muted block text-[10px]">Tracked Work Time:</span>
                    <span className="font-mono font-semibold text-ink">
                      {(selectedTaskForReassign.totalDurationMinutes / 60).toFixed(1)} hrs ({selectedTaskForReassign.totalDurationMinutes} mins)
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10px]">Internal Due Date:</span>
                    <span className="font-semibold text-ink">
                      {selectedTaskForReassign.internalDeadline
                        ? fmtDate(selectedTaskForReassign.internalDeadline)
                        : "No due date"}
                    </span>
                  </div>
                </div>

                {/* Latest Progress Comment / Standup Update */}
                {selectedTaskForReassign.latestUpdate ? (
                  <div className="mt-2 rounded bg-canvas p-2 text-[11px] border border-line/60">
                    <div className="flex items-center justify-between text-[10px] text-muted pb-0.5 mb-1 border-b border-line/40">
                      <span className="font-semibold text-ink">
                        Latest Daily Update ({selectedTaskForReassign.latestUpdate.authorName})
                      </span>
                      <span>{fmtDate(selectedTaskForReassign.latestUpdate.createdAt)}</span>
                    </div>
                    <div className="text-ink line-clamp-3 italic">
                      "{selectedTaskForReassign.latestUpdate.body}"
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted italic">No comments or daily notes posted yet.</div>
                )}
              </div>

              {/* Current Assignee */}
              <div>
                <span className="text-muted text-[11px] uppercase tracking-wider block">Assigned Team Member</span>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar name={selectedTaskForReassign.assigneeName || "Unassigned"} size={22} />
                  <span className="font-medium text-ink">
                    {selectedTaskForReassign.assigneeName || "Unassigned (Nobody)"}
                  </span>
                </div>
              </div>

              {/* Assign To New Editor */}
              <div>
                <label className="text-muted text-[11px] uppercase tracking-wider block mb-1">
                  Reassign / Handover To
                </label>
                <select
                  value={targetAssigneeId}
                  onChange={(e) => setTargetAssigneeId(e.target.value)}
                  className="cell-select w-full py-1.5 text-[13px]"
                >
                  <option value="">Select editor to take over...</option>
                  {people
                    .filter((p) => p.id !== selectedTaskForReassign.assigneeId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.department || "Editor"})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-3">
              <Link
                href={
                  selectedTaskForReassign.brandId
                    ? `/brands/${selectedTaskForReassign.brandId}?task=${selectedTaskForReassign.id}`
                    : `/projects?task=${selectedTaskForReassign.id}`
                }
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
              >
                Open Deliverable & Comments ↗
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForReassign(null)}
                  className="btn-ghost py-1 text-[12px]"
                >
                  Close
                </button>
                {targetAssigneeId && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleReassign(selectedTaskForReassign, targetAssigneeId)}
                    className="btn-primary py-1 px-4 text-[12px]"
                  >
                    {isPending ? "Reassigning…" : "Confirm Handover"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pull Free Editor onto a Task */}
      {quickAssignPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleQuickAssign}
            className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-[15px] font-semibold text-ink">Pull {quickAssignPerson.name} Onto Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickAssignPerson(null)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px]">
              <div>
                <label className="text-muted text-[11px] uppercase tracking-wider block mb-1">
                  Select Deliverable / Video
                </label>
                <select
                  value={quickAssignTaskId}
                  onChange={(e) => setQuickAssignTaskId(e.target.value)}
                  className="cell-select w-full py-1.5 text-[13px]"
                  required
                >
                  <option value="">Choose task...</option>
                  {activeTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.brandName ? `[${t.brandName}] ` : ""}{t.title} ({t.assigneeName ? `Current: ${t.assigneeName}` : "Unassigned"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setQuickAssignPerson(null)}
                className="btn-ghost py-1 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!quickAssignTaskId || isPending}
                className="btn-primary py-1 px-4 text-[12px]"
              >
                {isPending ? "Assigning…" : `Assign to ${quickAssignPerson.name}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Point 5 Modal: Team Member Individual View (Individual tasks, what they're working on right now, and time logged on each task) */}
      {selectedMemberView && (() => {
        const memberAllTasks = tasks.filter((t) => t.assigneeId === selectedMemberView.id);
        const memberActiveTasks = memberAllTasks.filter((t) => !isDone(t));
        const memberDoneTasks = memberAllTasks.filter((t) => isDone(t));
        const workingRightNowTask =
          memberActiveTasks.find(
            (t) => t.editStatus === "In Progress" || (t.startAt && !t.endAt)
          ) || getPersonHourTask(selectedMemberView.id, defaultHour());
        const totalLoggedMinutes = memberAllTasks.reduce(
          (sum, t) => sum + (t.totalDurationMinutes || 0),
          0
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setSelectedMemberView(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-line bg-surface shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-canvas/50">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedMemberView.name} size={38} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-bold text-ink">{selectedMemberView.name}</h3>
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {selectedMemberView.department || "Post-Production"}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      Individual Tasks, Current Live Work & Time Logged Per Deliverable
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Total Time Logged
                    </div>
                    <div className="font-mono text-[15px] font-bold text-[#0052CC]">
                      {(totalLoggedMinutes / 60).toFixed(1)} hrs ({totalLoggedMinutes}m)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemberView(null)}
                    className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-canvas cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* 1. What They're Working On Right Now */}
                <div className="rounded-xl border border-amber-300/80 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                      Working On Right Now
                    </span>
                    {workingRightNowTask && (
                      <span className="font-mono text-[11.5px] font-bold text-ink">
                        ⏱️ {(workingRightNowTask.totalDurationMinutes / 60).toFixed(1)}h logged on this task
                      </span>
                    )}
                  </div>

                  {workingRightNowTask ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div>
                        <div className="text-[14px] font-bold text-ink">
                          [{workingRightNowTask.brandName || "Brand"}] {workingRightNowTask.title}
                        </div>
                        <div className="text-[12px] text-muted mt-0.5">
                          Stage: <strong className="text-ink">{workingRightNowTask.editStatus}</strong> ·
                          Campaign: <strong className="text-ink">{workingRightNowTask.campaignName || "General"}</strong> ·
                          Due: <strong className="text-ink">{workingRightNowTask.internalDeadline ? fmtDate(workingRightNowTask.internalDeadline) : "Not set"}</strong>
                        </div>
                      </div>
                      <Link
                        href={
                          workingRightNowTask.brandId
                            ? `/brands/${workingRightNowTask.brandId}?task=${workingRightNowTask.id}`
                            : `/projects?task=${workingRightNowTask.id}`
                        }
                        className="btn-primary text-[12px] py-1.5 px-3"
                      >
                        Open Live Task ↗
                      </Link>
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-emerald-700 dark:text-emerald-400 font-medium">
                      Currently free / no active timer running right now.
                    </div>
                  )}
                </div>

                {/* 2. Individual Tasks & Time Logged Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-muted">
                      Individual Tasks & Time Logged ({memberAllTasks.length} total · {memberActiveTasks.length} active · {memberDoneTasks.length} completed)
                    </h4>
                  </div>

                  {memberAllTasks.length === 0 ? (
                    <div className="rounded-lg border border-line p-6 text-center text-[13px] text-muted">
                      No tasks currently assigned to {selectedMemberView.name}.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-line overflow-hidden">
                      <table className="w-full text-left border-collapse text-[12.5px]">
                        <thead>
                          <tr className="border-b border-line bg-canvas text-[10.5px] font-bold uppercase tracking-wider text-muted">
                            <th className="py-2.5 px-3">Deliverable / Task</th>
                            <th className="py-2.5 px-3">Brand / Campaign</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Due Date</th>
                            <th className="py-2.5 px-3 text-right">Time Logged</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/60">
                          {memberAllTasks.map((t) => {
                            const hrs = ((t.totalDurationMinutes || 0) / 60).toFixed(1);
                            const completed = isDone(t);
                            return (
                              <tr key={t.id} className="hover:bg-canvas/50">
                                <td className="py-2.5 px-3">
                                  <div className={cn("font-semibold text-ink", completed && "line-through text-muted")}>
                                    {t.title}
                                  </div>
                                  <div className="text-[10.5px] font-mono text-muted">{t.code}</div>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-medium text-ink">{t.brandName || "—"}</div>
                                  <div className="text-[10.5px] text-muted">{t.campaignName || ""}</div>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                                      completed
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                        : t.editStatus === "In Progress"
                                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                          : "bg-slate-200/70 dark:bg-white/10 text-muted"
                                    )}
                                  >
                                    {t.editStatus}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap text-muted text-[11.5px]">
                                  {t.internalDeadline ? fmtDate(t.internalDeadline) : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-[#0052CC]">
                                  {hrs}h <span className="text-[10.5px] font-normal text-muted">({t.totalDurationMinutes || 0}m)</span>
                                </td>
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <Link
                                    href={
                                      t.brandId
                                        ? `/brands/${t.brandId}?task=${t.id}`
                                        : `/projects?task=${t.id}`
                                    }
                                    className="text-[11.5px] font-bold text-[#0052CC] hover:underline"
                                  >
                                    Open ↗
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-line px-5 py-3 bg-canvas/40">
                <Link
                  href={`/projects?assignee=${selectedMemberView.id}`}
                  className="text-[12px] font-bold text-[#0052CC] hover:underline"
                >
                  Open Full Filtered Board for {selectedMemberView.name} ↗
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedMemberView(null)}
                  className="btn-primary text-[12px] px-4 py-1.5"
                >
                  Close View
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

