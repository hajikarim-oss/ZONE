"use client";

import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TaskDTO } from "@/lib/dto";
import { computeStage, isDone, STAGE_GROUPS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { getMyGoogleCalendarEvents } from "@/lib/actions";
import type { GoogleEventDTO } from "@/lib/google-calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function key(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const PRIORITY_DOTS: Record<string, string> = {
  High: "bg-rose-500",
  Medium: "bg-amber-500",
  Low: "bg-emerald-500",
};

export default function TaskCalendar({ tasks, onOpen, seeAll }: { tasks: TaskDTO[]; onOpen: (id: string) => void; seeAll: boolean }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [calView, setCalView] = useState<"month" | "week">("month");
  const [field, setField] = useState<"internalDeadline" | "externalDeadline">("internalDeadline");
  const [googleEvents, setGoogleEvents] = useState<GoogleEventDTO[]>([]);
  const [gcalError, setGcalError] = useState<string | null>(null);

  // Fetch Google Calendar events for the visible period
  useEffect(() => {
    const min = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
    const max = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1).toISOString();
    getMyGoogleCalendarEvents(min, max)
      .then((res) => {
        if (res?.error) {
          setGcalError(res.error);
        } else {
          setGoogleEvents(res?.events || []);
          setGcalError(null);
        }
      })
      .catch(() => {});
  }, [cursor]);

  // Map TBM tasks to dates
  const byDay = useMemo(() => {
    const m = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      const datesToRecord = new Set<string>();

      // Main deadline field
      const v = t[field];
      if (v) datesToRecord.add(key(new Date(v)));

      // If scheduled work times exist
      if (t.startAt) datesToRecord.add(key(new Date(t.startAt)));
      if (t.endAt) datesToRecord.add(key(new Date(t.endAt)));

      for (const k of datesToRecord) {
        const existing = m.get(k) ?? [];
        if (!existing.some((x) => x.id === t.id)) {
          m.set(k, [...existing, t]);
        }
      }
    }
    return m;
  }, [tasks, field]);

  // Map Google Calendar events to dates
  const googleByDay = useMemo(() => {
    const m = new Map<string, GoogleEventDTO[]>();
    for (const g of googleEvents) {
      if (!g.start) continue;
      const d = new Date(g.start);
      if (isNaN(d.getTime())) continue;
      const k = key(d);
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return m;
  }, [googleEvents]);

  // Month grid calculations
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (firstOfMonth.getDay() + 6) % 7; // Monday first
  const monthStart = new Date(firstOfMonth);
  monthStart.setDate(firstOfMonth.getDate() - offset);
  const monthDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(monthStart);
    d.setDate(monthStart.getDate() + i);
    return d;
  });

  // Week grid calculations
  const currentDayOffset = (cursor.getDay() + 6) % 7;
  const weekStart = new Date(cursor);
  weekStart.setDate(cursor.getDate() - currentDayOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const todayKey = key(new Date());

  const handlePrev = () => {
    if (calView === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    } else {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() - 7);
      setCursor(d);
    }
  };

  const handleNext = () => {
    if (calView === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    } else {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + 7);
      setCursor(d);
    }
  };

  const handleToday = () => {
    const d = new Date();
    setCursor(d);
  };

  // Header Title
  const headerTitle = useMemo(() => {
    if (calView === "month") {
      return cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }
    const end = new Date(weekDays[6]);
    return `${weekDays[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [cursor, calView, weekDays]);

  return (
    <div className="flex h-full flex-col">
      {/* Alert if Google Calendar API is not enabled in Google Cloud */}
      {gcalError && gcalError.includes("Google Calendar API") && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>
              <b>Google Calendar API is not enabled yet</b> in your Google Cloud Project. Please enable it to sync your calendar events.
            </span>
          </div>
          <a
            href="https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=163792264897"
            target="_blank"
            rel="noreferrer"
            className="btn-primary bg-amber-600 hover:bg-amber-700 text-white py-1 px-3 text-[11px] shrink-0 font-medium"
          >
            Enable Calendar API (1-Click)
          </a>
        </div>
      )}

      {/* Calendar Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button className="btn-outline px-2 py-1" onClick={handlePrev} title="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="btn-outline px-2 py-1" onClick={handleNext} title="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="btn-ghost px-2.5 py-1 text-[12px] font-medium" onClick={handleToday}>
            Today
          </button>
        </div>

        <h2 className="ml-1 text-[16px] font-semibold text-ink">
          {headerTitle}
        </h2>

        {/* View Mode Toggle: Month vs Week */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-line p-0.5 text-[12px]">
            <button
              onClick={() => setCalView("month")}
              className={cn("px-2.5 py-1 rounded font-medium transition-colors", calView === "month" ? "bg-accent text-white" : "text-muted hover:text-ink")}
            >
              Month
            </button>
            <button
              onClick={() => setCalView("week")}
              className={cn("px-2.5 py-1 rounded font-medium transition-colors", calView === "week" ? "bg-accent text-white" : "text-muted hover:text-ink")}
            >
              Week
            </button>
          </div>

          {seeAll && (
            <select
              value={field}
              onChange={(e) => setField(e.target.value as any)}
              className="field-input w-auto py-1 text-[12px]"
            >
              <option value="internalDeadline">Team deadlines</option>
              <option value="externalDeadline">Client deadlines</option>
            </select>
          )}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        {calView === "month" ? (
          /* Month View */
          <div className="grid min-w-[760px] grid-cols-7 text-[12px]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="border-b border-r border-line bg-canvas/40 px-2.5 py-2 font-medium text-muted">
                {w}
              </div>
            ))}
            {monthDays.map((d) => {
              const items = byDay.get(key(d)) ?? [];
              const gItems = googleByDay.get(key(d)) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = key(d) === todayKey;
              const totalItems = items.length + gItems.length;

              return (
                <div
                  key={key(d)}
                  className={cn(
                    "min-h-[110px] border-b border-r border-line p-1.5 transition-colors",
                    !inMonth ? "bg-canvas/40" : "hover:bg-canvas/20",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
                        isToday ? "bg-accent text-white font-bold" : inMonth ? "text-ink" : "text-muted/60",
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {totalItems > 0 && (
                      <span className="text-[10px] text-muted">{totalItems}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {/* TBM Tasks */}
                    {items.slice(0, 3).map((t) => {
                      const g = STAGE_GROUPS.find((x) => x.key === computeStage(t).key)!;
                      const hasTime = t.startAt && key(new Date(t.startAt)) === key(d);
                      const timeStr = hasTime
                        ? new Date(t.startAt!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
                        : null;

                      return (
                        <button
                          key={t.id}
                          onClick={() => onOpen(t.id)}
                          className={cn(
                            "group flex w-full flex-col items-start rounded px-1.5 py-1 text-left text-[11px] border border-line/40 transition hover:shadow-xs",
                            isDone(t) && "line-through opacity-60",
                          )}
                          style={{ background: g.dot + "1f" }}
                          title={`${t.code} · ${t.title} (${t.brandName ?? "No brand"})`}
                        >
                          <div className="flex w-full items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOTS[t.priority] ?? "bg-accent")} />
                            <span className="truncate font-medium text-ink flex-1">{t.title}</span>
                          </div>
                          {timeStr ? (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted mt-0.5 font-normal">
                              <Clock className="h-2.5 w-2.5" /> {timeStr}
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted mt-0.5 truncate">{t.brandName ?? t.code}</span>
                          )}
                        </button>
                      );
                    })}

                    {/* Google Calendar Events */}
                    {gItems.slice(0, 2).map((g) => {
                      const timeStr = !g.isAllDay && g.start
                        ? new Date(g.start).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
                        : null;

                      return (
                        <a
                          key={g.id}
                          href={g.htmlLink || "https://calendar.google.com"}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex w-full flex-col items-start rounded px-1.5 py-0.5 text-left text-[11px] bg-blue-50/90 text-blue-900 border border-blue-200/80 hover:border-blue-400 transition"
                          title={`Google Calendar: ${g.summary}`}
                        >
                          <div className="flex w-full items-center gap-1">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                            <span className="truncate font-medium text-blue-900 flex-1">{g.summary}</span>
                          </div>
                          {timeStr && (
                            <span className="flex items-center gap-0.5 text-[9px] text-blue-700/80 mt-0.5">
                              <Clock className="h-2 w-2" /> {timeStr}
                            </span>
                          )}
                        </a>
                      );
                    })}

                    {totalItems > 4 && (
                      <div className="px-1 text-[10px] font-medium text-accent">
                        +{totalItems - 4} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Week View (agenda column style) */
          <div className="grid min-w-[800px] grid-cols-7 text-[12px]">
            {weekDays.map((d, i) => {
              const items = byDay.get(key(d)) ?? [];
              const gItems = googleByDay.get(key(d)) ?? [];
              const isToday = key(d) === todayKey;
              const totalItems = items.length + gItems.length;

              return (
                <div key={key(d)} className="border-r border-line flex flex-col min-h-[460px]">
                  {/* Day Header */}
                  <div
                    className={cn(
                      "border-b border-line px-2 py-2.5 text-center transition-colors",
                      isToday ? "bg-accent-soft/40" : "bg-canvas/30",
                    )}
                  >
                    <div className="text-[11px] font-medium text-muted uppercase tracking-wider">{WEEKDAYS[i]}</div>
                    <div
                      className={cn(
                        "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-semibold",
                        isToday ? "bg-accent text-white" : "text-ink",
                      )}
                    >
                      {d.getDate()}
                    </div>
                  </div>

                  {/* Day Items List */}
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {totalItems === 0 ? (
                      <div className="flex h-32 items-center justify-center text-[11px] text-muted/50 italic">
                        No events
                      </div>
                    ) : (
                      <>
                        {/* Google Calendar events in Week view */}
                        {gItems.map((g) => {
                          const timeStr = !g.isAllDay && g.start
                            ? new Date(g.start).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
                            : "All day";

                          return (
                            <a
                              key={g.id}
                              href={g.htmlLink || "https://calendar.google.com"}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-full rounded-lg border border-blue-200 bg-blue-50/80 p-2 text-left shadow-xs transition hover:border-blue-400"
                            >
                              <div className="flex items-center gap-1 text-[10px] text-blue-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                                <span className="truncate font-medium">Google Calendar</span>
                              </div>
                              <div className="mt-1 font-semibold text-[12px] leading-snug text-blue-950">
                                {g.summary}
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[10px] text-blue-700/80">
                                <span className="flex items-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" /> {timeStr}
                                </span>
                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                              </div>
                            </a>
                          );
                        })}

                        {/* TBM Tasks */}
                        {items.map((t) => {
                          const g = STAGE_GROUPS.find((x) => x.key === computeStage(t).key)!;
                          const hasTime = t.startAt && key(new Date(t.startAt)) === key(d);
                          const timeStr = hasTime
                            ? new Date(t.startAt!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
                            : null;

                          return (
                            <button
                              key={t.id}
                              onClick={() => onOpen(t.id)}
                              className={cn(
                                "w-full rounded-lg border border-line/60 p-2 text-left shadow-xs transition hover:border-accent hover:shadow-sm",
                                isDone(t) && "opacity-60",
                              )}
                              style={{ borderLeftColor: g.dot, borderLeftWidth: "4px" }}
                            >
                              <div className="flex items-center gap-1 text-[10px] text-muted">
                                <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOTS[t.priority] ?? "bg-accent")} />
                                <span className="truncate">{t.brandName ?? t.code}</span>
                              </div>
                              <div className={cn("mt-1 font-medium text-[12px] leading-snug text-ink", isDone(t) && "line-through")}>
                                {t.title}
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                                <span>{computeStage(t).label}</span>
                                {timeStr && (
                                  <span className="flex items-center gap-0.5 font-medium text-accent">
                                    <Clock className="h-2.5 w-2.5" /> {timeStr}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
