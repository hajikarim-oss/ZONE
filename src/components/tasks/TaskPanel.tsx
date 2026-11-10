"use client";

import { AlertTriangle, Archive, ArchiveRestore, Calendar, CalendarDays, Check, CheckSquare, ChevronDown, Clock, ExternalLink, Flame, FolderGit2, Link2, Lock, MessageSquare, Paperclip, PanelRightClose, Pause, Play, Plus, Send, Sparkles, Trash2, UserPlus, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { addCollaborator, addTimeEntry, addUpdate, deleteTask, deleteTimeEntry, deleteUpdate, getTaskThread, getTimeEntries, removeCollaborator, requestDeadlineExtension, setArchived, startWorkSession, stopWorkSession, type ActivityDTO, type AttachmentDTO, type SubtaskDTO, type TimeEntryDTO, type UpdateDTO } from "@/lib/actions";
import {
  getActiveSession,
  setActiveSession,
  extendActiveSession,
  STANDARD_SESSION_LIMIT_SECONDS,
  MAX_SESSION_LIMIT_SECONDS,
  SESSION_GRACE_SECONDS,
  formatElapsed,
} from "@/lib/session";
import { PLATFORMS, PRIORITIES, TYPES, WORK_TYPES } from "@/lib/constants";
import type { BrandDTO, PersonDTO, StorageDTO, TaskDTO } from "@/lib/dto";
import { canEditField, canManageCollaborators } from "@/lib/rbac";
import { cn, fmtDate, fmtDateTime, fromInputDateTime, toInputDate, toInputDateTime } from "@/lib/utils";
import { dropPatch } from "@/lib/board";
import { isDone } from "@/lib/status";
import { CellSelect, DelayBadge, opts, StatusSelect } from "./bits";
import { Attachments, StoragePicker, Subtasks } from "./TaskExtras";
import ProjectCostingPanel from "./ProjectCostingPanel";
import { JiraEpicPill, JiraIssueKey, JiraIssueTypeIcon, JiraPriorityIcon } from "../jira/JiraBits";
import CreateCampaignModal from "../brands/CreateCampaignModal";

type Props = {
  task: TaskDTO;
  people: PersonDTO[];
  brands: BrandDTO[];
  storages: StorageDTO[];
  onStorageCreated: (s: StorageDTO) => void;
  viewer: { id: string; role: string; seeAll: boolean; admin: boolean; brandIds?: string[] };
  onClose: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRemoved: (id: string) => void;
  onReplace: (task: TaskDTO) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-0.5 md:grid-cols-[130px_1fr]">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-1 px-2 py-1 sm:border-b sm:border-line/70 sm:odd:border-r">
      <div className="pl-1 text-[12px] text-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Linkify drive links and highlight @mentions in comments
function RichText({ text, names = [] }: { text: string; names?: string[] }) {
  const mention = names.length
    ? new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")}))`, "gi")
    : null;
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
            {p.length > 60 ? p.slice(0, 57) + "…" : p}
          </a>
        ) : mention ? (
          <span key={i}>
            {p.split(mention).map((q, j) =>
              j % 2 === 1 ? (
                <span key={j} className="rounded bg-accent-soft px-1 font-medium text-accent">{q}</span>
              ) : (
                <span key={j}>{q}</span>
              ),
            )}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export default function TaskPanel({ task: t, people, brands, storages, onStorageCreated, viewer, onClose, onUpdate, onRemoved, onReplace }: Props) {
  const { seeAll, admin, id: viewerId } = viewer;
  const [updates, setUpdates] = useState<UpdateDTO[] | null>(null);
  const [activity, setActivity] = useState<ActivityDTO[]>([]);
  const [subtasks, setSubtasksRaw] = useState<SubtaskDTO[] | null>(null);
  const [attachments, setAttachmentsRaw] = useState<AttachmentDTO[] | null>(null);
  const setSubtasks = (fn: (x: SubtaskDTO[]) => SubtaskDTO[]) => setSubtasksRaw((x) => fn(x ?? []));
  const setAttachments = (fn: (x: AttachmentDTO[]) => AttachmentDTO[]) => setAttachmentsRaw((x) => fn(x ?? []));
  const [tab, setTab] = useState<"updates" | "standup" | "activity" | "time">("updates");
  const [timeEntries, setTimeEntries] = useState<TimeEntryDTO[] | null>(null);
  const [logMins, setLogMins] = useState(60);
  const [logWorkType, setLogWorkType] = useState<string>(WORK_TYPES[0]);
  const [logNotes, setLogNotes] = useState("");
  const [timeLoading, setTimeLoading] = useState(false);

  // Live Stopwatch Session State (syncs with global session) + Point 6 Standard Session Limit Watchdog
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionLimitSeconds, setSessionLimitSeconds] = useState(STANDARD_SESSION_LIMIT_SECONDS);
  const [sessionLimitPromptOpen, setSessionLimitPromptOpen] = useState(false);

  // Stop & Log Progress Modal State
  const [stopSessionModalOpen, setStopSessionModalOpen] = useState(false);
  const [stopModalMinutes, setStopModalMinutes] = useState(15);
  const [stopModalWorkType, setStopModalWorkType] = useState(t.workType || "Assembly Edit");
  const [stopModalNotes, setStopModalNotes] = useState("");
  const [stopModalMarkSubmitted, setStopModalMarkSubmitted] = useState(false);
  const [stopModalBusy, setStopModalBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      const s = getActiveSession();
      if (s && s.taskId === t.id) {
        setSessionActive(true);
        setSessionSeconds(Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)));
        setSessionLimitSeconds(s.limitSeconds ?? STANDARD_SESSION_LIMIT_SECONDS);
      } else {
        setSessionActive(false);
      }
    };
    sync();
    window.addEventListener("tbm_session_change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tbm_session_change", sync);
      window.removeEventListener("storage", sync);
    };
  }, [t.id]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (sessionActive) {
      interval = setInterval(() => {
        setSessionSeconds((s) => {
          const next = s + 1;
          if (next >= sessionLimitSeconds) {
            setSessionLimitPromptOpen(true);
          }
          // Auto-stop if user hasn't responded within grace window (prevents overnight runaway timers)
          if (next >= sessionLimitSeconds + SESSION_GRACE_SECONDS) {
            const cappedMins = Math.max(5, Math.round(sessionLimitSeconds / 60));
            setActiveSession(null);
            setSessionActive(false);
            setSessionLimitPromptOpen(false);
            stopWorkSession({
              projectId: t.id,
              durationMinutes: cappedMins,
              workType: t.workType || "Assembly Edit",
              notes: `Auto-stopped at standard session limit (${Math.round(sessionLimitSeconds / 3600)}h) — no user response`,
            })
              .then((res) => {
                setTimeEntries((prev) => [res.entry, ...(prev ?? [])]);
                onUpdate(t.id, { totalDurationMinutes: (t.totalDurationMinutes || 0) + cappedMins });
              })
              .catch(() => {});
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive, sessionLimitSeconds, t.id, t.workType, t.totalDurationMinutes, onUpdate]);

  function handleExtendSession(extraHours: number) {
    const updated = extendActiveSession(extraHours);
    if (updated) {
      setSessionLimitSeconds(updated.limitSeconds ?? STANDARD_SESSION_LIMIT_SECONDS);
      setSessionLimitPromptOpen(false);
    }
  }

  function formatSessionTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  async function toggleSession() {
    if (!sessionActive) {
      try {
        await startWorkSession(t.id);
        setActiveSession({
          taskId: t.id,
          taskCode: t.code,
          taskTitle: t.title,
          brandName: t.brandName,
          campaignName: t.campaignName,
          workType: t.workType || "Assembly Edit",
          startedAt: Date.now(),
        });
        setSessionActive(true);
        setSessionSeconds(0);
        onUpdate(t.id, { editStatus: "In Progress" });
      } catch (err) {
        setErr(err instanceof Error ? err.message : "Failed to start live session");
      }
    } else {
      const mins = Math.max(5, Math.round(sessionSeconds / 60));
      setStopModalMinutes(mins);
      setStopModalWorkType(t.workType || "Assembly Edit");
      setStopModalNotes("");
      setStopModalMarkSubmitted(false);
      setStopSessionModalOpen(true);
    }
  }

  async function handleConfirmStopSession(e: React.FormEvent) {
    e.preventDefault();
    setStopModalBusy(true);
    try {
      const res = await stopWorkSession({
        projectId: t.id,
        durationMinutes: Number(stopModalMinutes) || 1,
        workType: stopModalWorkType,
        notes: stopModalNotes.trim() || undefined,
        markSubmitted: stopModalMarkSubmitted,
      });

      setActiveSession(null);
      setSessionActive(false);
      setSessionSeconds(0);
      setStopSessionModalOpen(false);

      setTimeEntries((prev) => [res.entry, ...(prev ?? [])]);
      onUpdate(t.id, {
        totalDurationMinutes: (t.totalDurationMinutes || 0) + Number(stopModalMinutes),
        ...(stopModalMarkSubmitted ? { editStatus: "Submitted" } : {}),
      });
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Failed to log progress");
    } finally {
      setStopModalBusy(false);
    }
  }

  async function quickLogMinutes(mins: number, customNotes?: string) {
    try {
      const entry = await addTimeEntry({
        projectId: t.id,
        durationMinutes: mins,
        workType: t.workType || "Assembly",
        notes: customNotes || "Quick progress log",
      });
      setTimeEntries((prev) => [entry, ...(prev ?? [])]);
      onUpdate(t.id, { totalDurationMinutes: (t.totalDurationMinutes || 0) + mins });
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Couldn't log time");
    }
  }

  // 24h Pre-Deadline Commit or Reschedule
  const [onTrackConfirmed, setOnTrackConfirmed] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [newProposedDate, setNewProposedDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // Daily Standup Form State
  const [standupProgress, setStandupProgress] = useState("");
  const [standupNext, setStandupNext] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("None");
  const [standupBusy, setStandupBusy] = useState(false);

  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes ?? "");
  const [context, setContext] = useState(t.context ?? "");
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(t.title);
    setNotes(t.notes ?? "");
    setContext(t.context ?? "");
  }, [t.id, t.title, t.notes, t.context]);

  function standardizeTitle() {
    const brandName = t.brandName ?? "Brand";
    const campName = t.campaignName ?? "Campaign";
    const core = t.title.replace(/^.* - v\d+$/i, "").trim() || t.type || "Deliverable";
    const formatted = `${brandName} - ${campName} - ${core} - v${t.version || 1}`;
    setTitle(formatted);
    onUpdate(t.id, { title: formatted });
  }

  function onLogTime(e: React.FormEvent) {
    e.preventDefault();
    if (!logMins || logMins <= 0) return;
    setTimeLoading(true);
    addTimeEntry({
      projectId: t.id,
      durationMinutes: Number(logMins),
      workType: logWorkType,
      notes: logNotes,
    })
      .then((entry) => {
        setTimeEntries((prev) => [entry, ...(prev ?? [])]);
        setLogNotes("");
        onUpdate(t.id, { totalDurationMinutes: t.totalDurationMinutes + entry.durationMinutes });
      })
      .catch((err) => setErr(err instanceof Error ? err.message : "Couldn't log time"))
      .finally(() => setTimeLoading(false));
  }

  const deadlineCountdownInfo = useMemo(() => {
    if (isDone(t) || !t.internalDeadline) return null;
    const due = new Date(t.internalDeadline).getTime();
    const now = Date.now();
    const diffHours = Math.round((due - now) / (1000 * 60 * 60));

    // Overdue states: Next Morning 10 AM Manager Escalation -> +24h No Action Founder Escalation
    if (diffHours < 0) {
      const overdueHrs = Math.abs(diffHours);
      const isFounderEscalated = overdueHrs >= 24;
      return {
        tier: isFounderEscalated ? "founder_escalated" : "manager_escalated",
        icon: isFounderEscalated ? "🚨" : "⚠️",
        headline: isFounderEscalated
          ? `P0 FOUNDER ESCALATION (+${overdueHrs}h) · ALL 6 FOUNDERS ALERTED`
          : `NEXT-DAY 10:00 AM MANAGER ESCALATION (+${overdueHrs}h past due)`,
        sub: isFounderEscalated
          ? "No action recorded 24h after Manager Alert. Escalated to Pratik, Suraj, Sachin, Uday, Suraj Maurya & Monu."
          : `Reporting Manager (${t.createdByName || "Manager"}) alerted at 10:00 AM. 24h window to resolve before Founder Escalation.`,
        badgeClass: isFounderEscalated
          ? "border-rose-500 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
          : "border-orange-400 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
        btnLabel: "Revise Timeline Now",
      };
    }

    // Same Day of Deadline (10 AM -> 6 PM -> 8 PM No-Change Watchdog)
    if (diffHours <= 14) {
      const istHour = new Date().getHours();
      const stageLabel =
        istHour >= 20
          ? "🚨 8:00 PM Watchdog: Update progress now before tomorrow's 10:00 AM Manager Alert"
          : istHour >= 18
            ? "🌆 6:00 PM – 8:00 PM Window Active: Submit cut or log progress before 8:00 PM"
            : "☀️ 10:00 AM Deadline Day Check-In: Reminders active at 10 AM, 6 PM & 8 PM";
      return {
        tier: "deadline_today",
        icon: istHour >= 20 ? "🚨" : "⏰",
        headline: `DUE TODAY (${fmtDate(t.internalDeadline, true)}) · Slack/Jira Smart Watchdog Active`,
        sub: stageLabel,
        badgeClass:
          istHour >= 20
            ? "border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            : "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
        btnLabel: "Request Extension",
      };
    }

    // 24 Hours Pre-Deadline Check-In Window
    if (diffHours <= 36) {
      return {
        tier: "warning_24h",
        icon: "⏳",
        headline: `T-24H PRE-DEADLINE REMINDER: Due ${fmtDate(t.internalDeadline, true)}`,
        sub: "24h check-in sent to assignee. Next reminders: Deadline Day 10:00 AM → 6:00 PM → 8:00 PM → Next Day 10:00 AM Manager.",
        badgeClass: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
        btnLabel: "Request Extension",
      };
    }

    return null;
  }, [t]);

  function confirmOnTrack() {
    setOnTrackConfirmed(true);
    start(async () => {
      try {
        const author = me?.name ?? "Assignee";
        await addUpdate(t.id, `✅ Delivery on track: ${author} confirmed this deliverable will be finished by scheduled deadline (${fmtDate(t.internalDeadline)}).`);
        const freshUpdates = await getTaskThread(t.id);
        setUpdates(freshUpdates.updates);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't confirm on track");
      }
    });
  }

  async function submitReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newProposedDate || !rescheduleReason.trim()) return;
    setRescheduleBusy(true);
    try {
      await requestDeadlineExtension(t.id, newProposedDate, rescheduleReason.trim());
      const freshUpdates = await getTaskThread(t.id);
      setUpdates(freshUpdates.updates);
      setRescheduleModalOpen(false);
      setRescheduleReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't submit reschedule request");
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function submitStandup(e: React.FormEvent) {
    e.preventDefault();
    if (!standupProgress.trim()) return;
    setStandupBusy(true);
    try {
      const author = me?.name ?? "Editor";
      const dateStr = fmtDate(new Date(), true);
      const body = `🟢 DAILY STANDUP · ${dateStr}
• Today's Cut / Progress: ${standupProgress.trim()}
• Next Steps: ${standupNext.trim() || "Continuing edit"}
• Blockers: ${standupBlockers.trim() || "None"}`;
      await addUpdate(t.id, body);
      const fresh = await getTaskThread(t.id);
      setUpdates(fresh.updates);
      setStandupProgress("");
      setStandupNext("");
      setStandupBlockers("None");
      setTab("updates");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't post standup update");
    } finally {
      setStandupBusy(false);
    }
  }

  // Load comments + history + time logs when a task opens ("Loading…" only then).
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const first = openedId.current !== t.id;
    openedId.current = t.id;
    if (first) {
      setUpdates(null);
      setSubtasksRaw(null);
      setAttachmentsRaw(null);
      setTimeEntries(null);
    }
    const timer = setTimeout(
      () => {
        getTaskThread(t.id)
          .then((r) => {
            if (!live) return;
            setUpdates((cur) => [...r.updates, ...(cur ?? []).filter((u) => u.id.startsWith("tmp-"))]);
            setActivity(r.activity);
            setSubtasksRaw((cur) => [...r.subtasks, ...(cur ?? []).filter((x) => x.id.startsWith("tmp-"))]);
            setAttachmentsRaw(r.attachments);
          })
          .catch(() => live && first && setUpdates([]));

        getTimeEntries(t.id)
          .then((entries) => {
            if (live) setTimeEntries(entries);
          })
          .catch(() => live && first && setTimeEntries([]));
      },
      first ? 0 : 1200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [t.id, t.updatedAt]);

  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Keep the counts shown in the list / board in step with the panel.
  useEffect(() => {
    if (!subtasks || !attachments) return;
    const real = subtasks.filter((x) => !x.id.startsWith("tmp-"));
    const next = {
      subtaskCount: real.length,
      subtaskDone: real.filter((x) => x.done).length,
      attachmentCount: attachments.length,
    };
    if (next.subtaskCount !== t.subtaskCount || next.subtaskDone !== t.subtaskDone || next.attachmentCount !== t.attachmentCount)
      onReplace({ ...t, ...next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtasks, attachments]);

  const can = (field: string) => canEditField(viewer, field, t);
  const canCollab = canManageCollaborators(viewer, t);
  const names = people.map((p) => p.name);

  // Shows the change at once, then saves (and undoes it if saving fails).
  function collab(action: "add" | "remove", userId: string) {
    setErr(null);
    const prev = t;
    const person = people.find((p) => p.id === userId);
    const list =
      action === "add"
        ? [...t.collaborators, { id: userId, name: person?.name ?? "…" }].sort((a, b) => a.name.localeCompare(b.name))
        : t.collaborators.filter((c) => c.id !== userId);
    onReplace({ ...t, collaborators: list, collaboratorIds: list.map((c) => c.id) });
    start(async () => {
      try {
        onReplace(action === "add" ? await addCollaborator(t.id, userId) : await removeCollaborator(t.id, userId));
      } catch (e) {
        onReplace(prev);
        setErr(e instanceof Error ? e.message : "Couldn't update collaborators");
      }
    });
  }

  // @mention autocomplete: watch the word being typed
  function onDraftChange(v: string) {
    setDraft(v);
    const el = inputRef.current;
    const upto = v.slice(0, el?.selectionStart ?? v.length);
    const m = upto.match(/(?:^|\s)@([\w ]{0,20})$/);
    setMentionQ(m ? m[1] : null);
  }
  const mentionOptions =
    mentionQ === null
      ? []
      : people.filter((p) => p.active && p.id !== viewerId && p.name.toLowerCase().startsWith(mentionQ.toLowerCase().trimStart())).slice(0, 6);
  function pickMention(name: string) {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, pos).replace(/@([\w ]{0,20})$/, `@${name} `);
    const next = before + draft.slice(pos);
    setDraft(next);
    setMentionQ(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  }
  const set = (field: string) => (v: string) => onUpdate(t.id, { [field]: v });
  const done = isDone(t);
  const brand = brands.find((b) => b.id === t.brandId);
  const subtasksRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const isCollaborator = t.collaboratorIds.includes(viewerId);

  function toggleComplete() {
    const patch = dropPatch(t, done ? "ongoing" : "completed");
    if (patch) onUpdate(t.id, patch);
  }

  // Comment appears instantly; it's swapped for the saved one when the server replies.
  function post() {
    const body = draft.trim();
    if (!body) return;
    setErr(null);
    const tmpId = `tmp-${Date.now()}`;
    const me = people.find((p) => p.id === viewerId);
    setUpdates((x) => [...(x ?? []), { id: tmpId, authorId: viewerId, authorName: me?.name ?? "You", body, createdAt: new Date().toISOString() }]);
    setDraft("");
    setMentionQ(null);
    setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: "smooth" }), 30);
    addUpdate(t.id, body)
      .then((u) => setUpdates((x) => (x ?? []).map((y) => (y.id === tmpId ? u : y))))
      .catch((e) => {
        setUpdates((x) => (x ?? []).filter((y) => y.id !== tmpId));
        setDraft(body);
        setErr(e instanceof Error ? e.message : "Couldn't post");
      });
  }

  const focusComments = () => {
    setTab("updates");
    setTimeout(() => {
      commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus();
    }, 50);
  };
  const scrollTo = (r: React.RefObject<HTMLDivElement | null>) => r.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const me = people.find((p) => p.id === viewerId);

  return (
    <>
      {/* Dimmed backdrop - clicking it dismisses the drawer smoothly without squashing background view */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Jira Slide-Over Issue Detail Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[760px] lg:max-w-[860px] xl:max-w-[940px] flex-col bg-surface shadow-2xl border-l border-line animate-in slide-in-from-right duration-200 select-none">
        {/* Jira Issue Header Toolbar */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-canvas/40 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <JiraIssueTypeIcon type={t.type || t.workType} className="h-5 w-5 rounded" />
            <span className="font-bold text-[13px] text-[#0052CC] dark:text-[#4C9AFF]">{t.code}</span>
            <span className="text-muted">/</span>
            <span className="truncate text-[12px] text-muted max-w-[140px]">{t.brandName || "Brand"}</span>
            <DelayBadge t={t} />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              className="jira-btn-subtle px-2 py-1 text-[12px] text-muted hover:text-ink"
              title="Attach file"
              onClick={() => scrollTo(filesRef)}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Attach</span>
            </button>

            <button
              className="jira-btn-subtle px-2 py-1 text-[12px] text-muted hover:text-ink"
              title="Add subtask / checklist item"
              onClick={() => scrollTo(subtasksRef)}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Subtask</span>
            </button>

            <button
              className="jira-btn-subtle px-2 py-1 text-[12px] text-muted hover:text-ink"
              title="Log work"
              onClick={() => {
                setTab("time");
                setTimeout(() => commentsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log work</span>
            </button>

            <button
              className="jira-btn-subtle px-2 py-1 text-[12px] text-muted hover:text-ink"
              title={linkCopied ? "Link copied" : "Copy issue link"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                } catch { }
              }}
            >
              {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>

            {(seeAll || t.assigneeId === viewerId || t.createdById === viewerId) && (
              <button
                className="jira-btn-subtle px-2 py-1 text-muted hover:text-ink"
                title={t.archived ? "Move back to active" : "Move to Completed (archive)"}
                onClick={() => { onRemoved(t.id); setArchived(t.id, !t.archived).catch(() => alert("Couldn't move it.")); }}
              >
                {t.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </button>
            )}

            {(admin || seeAll || t.assigneeId === viewerId || t.createdById === viewerId) && (
              <button
                className="jira-btn-subtle px-2 py-1 text-rose-600 hover:bg-rose-50"
                title="Delete task"
                onClick={() => {
                  if (!confirm(`Delete ${t.code} "${t.title}"? (Goal-linked tasks are safely audit-archived).`)) return;
                  onRemoved(t.id);
                  deleteTask(t.id).catch(() => alert("Couldn't delete it."));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="h-4 w-px bg-line mx-1" />

            <button className="jira-btn-subtle p-1.5 text-muted hover:text-ink" onClick={onClose} title="Close (Esc)">
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto">
          <div className="p-4 md:p-6">
            {err && (
              <button onClick={() => setErr(null)} className="mb-4 block w-full rounded border border-rose-200 bg-rose-50 px-3 py-2 text-left text-[12px] font-medium text-rose-700">
                {err} <span className="text-rose-400 font-normal">(dismiss)</span>
              </button>
            )}

            {/* POINT 7 & POINT 6: TOP-OF-PANEL LIVE TIME TRACKER + STANDARD SESSION LIMIT WATCHDOG */}
            <div className="mb-5 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/70 via-surface to-emerald-50/40 dark:from-blue-950/30 dark:via-[#161B22] dark:to-emerald-950/20 p-3.5 shadow-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg font-bold",
                    sessionActive ? "bg-emerald-600 text-white animate-pulse" : "bg-[#0052CC]/10 text-[#0052CC]"
                  )}>
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-ink">
                        Live Time Tracker
                      </span>
                      <span className="rounded-full bg-[#0052CC]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#0052CC] dark:text-blue-300">
                        {Math.round(((t.totalDurationMinutes || 0) / 60) * 10) / 10}h total logged
                      </span>
                      <span className="text-[10.5px] text-muted hidden sm:inline">
                        · Standard Session Limit: {Math.round(sessionLimitSeconds / 3600)}h max block
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {sessionActive
                        ? `Session running (${formatSessionTime(sessionSeconds)} / ${formatSessionTime(sessionLimitSeconds)} limit) — auto-stops if left unattended overnight`
                        : "Placed at top of task panel — start live timer or log work duration in 1 click"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleSession}
                    className={cn(
                      "h-8 px-3.5 rounded-lg font-bold text-[12px] inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs",
                      sessionActive
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-[#0052CC] hover:bg-[#0047B3] text-white"
                    )}
                  >
                    {sessionActive ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Stop & Log ({formatSessionTime(sessionSeconds)})</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Start Timer</span>
                      </>
                    )}
                  </button>

                  {[
                    [30, "+30m"],
                    [60, "+1h"],
                    [120, "+2h"],
                    [240, "+4h"],
                  ].map(([mins, lbl]) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => quickLogMinutes(mins as number)}
                      className="h-8 px-2.5 rounded-lg border border-line bg-surface hover:bg-slate-100 dark:hover:bg-white/10 text-[11.5px] font-semibold text-ink transition cursor-pointer"
                      title={`Quick log ${lbl}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Point 6: Standard Session Limit Reached Notification Banner */}
              {(sessionLimitPromptOpen || (sessionActive && sessionSeconds >= sessionLimitSeconds)) && (
                <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/60 p-3 flex flex-wrap items-center justify-between gap-3 animate-pulse">
                  <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="text-[12px]">
                      <strong>Standard Session Limit ({Math.round(sessionLimitSeconds / 3600)}h) Reached:</strong>{" "}
                      Please end your session now or extend it. If unanswered, the timer stops automatically so it won&apos;t run overnight.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {sessionLimitSeconds < MAX_SESSION_LIMIT_SECONDS && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleExtendSession(1)}
                          className="h-7 px-2.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Extend +1h
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExtendSession(2)}
                          className="h-7 px-2.5 rounded bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Extend +2h
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={toggleSession}
                      className="h-7 px-3 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                    >
                      End Session Now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* POINT 9: INACTIVE & INCOMPLETE TASK ALERTS — HIGHLIGHT MISSING FIELDS INSIDE TASK */}
            {(() => {
              const gaps: string[] = [];
              if (!t.assigneeId) gaps.push("Assignee");
              if (!t.internalDeadline) gaps.push("Internal Due Date");
              if (!t.campaignId) gaps.push("Campaign / Epic");
              if (!t.storageId) gaps.push("Hard Drive / Storage");
              if (!t.context?.trim()) gaps.push("Description / Brief");
              if (!t.workType) gaps.push("Work Type");
              const daysInactive = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
              if (gaps.length === 0 && daysInactive < 2) return null;
              return (
                <div className="mb-5 rounded-lg border border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-amber-950 dark:text-amber-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="font-bold">Task Completeness & Activity Check:</span>
                    {gaps.length > 0 && (
                      <span>
                        Missing required fields highlighted below:{" "}
                        {gaps.map((g) => (
                          <span
                            key={g}
                            className="inline-block rounded bg-amber-200/80 dark:bg-amber-900/70 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-950 dark:text-amber-100 mr-1"
                          >
                            {g}
                          </span>
                        ))}
                      </span>
                    )}
                    {daysInactive >= 2 && !done && (
                      <span className="rounded bg-rose-100 dark:bg-rose-950/70 px-2 py-0.5 text-[10.5px] font-bold text-rose-700 dark:text-rose-300">
                        No movement for {daysInactive} days
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              {/* Left Main Issue Column */}
              <div className="space-y-6 min-w-0">
                {/* Summary / Title */}
                <div>
                  {can("title") ? (
                    <div>
                      <textarea
                        value={title}
                        rows={1}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => title.trim() && title !== t.title && onUpdate(t.id, { title })}
                        className={cn(
                          "w-full resize-none rounded-[3px] border border-transparent p-1 text-[20px] font-bold leading-snug outline-none hover:border-line focus:border-[#0052CC]",
                          done && "text-muted line-through",
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={toggleSession}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-0.5 text-[11px] font-bold transition shadow-2xs cursor-pointer",
                            sessionActive
                              ? "border-emerald-600 bg-emerald-500 text-white animate-pulse"
                              : "border-emerald-600/30 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/60"
                          )}
                          title={sessionActive ? "Click to pause / log session" : "Start live editing work session"}
                        >
                          {sessionActive ? (
                            <>
                              <Pause className="h-3 w-3" />
                              <span>Active: {formatSessionTime(sessionSeconds)}</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-emerald-600 text-emerald-600" />
                              <span>Start Working</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={standardizeTitle}
                          className="inline-flex items-center gap-1 rounded bg-[#0052CC]/10 text-[#0052CC] px-2 py-0.5 text-[11px] font-semibold hover:bg-[#0052CC]/20 transition"
                          title="Format title as Brand - Campaign - Title - Version"
                        >
                          <Wand2 className="h-3 w-3" /> Standardize title
                        </button>

                        <button
                          onClick={toggleComplete}
                          disabled={!can("editStatus")}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-[3px] border px-2 py-0.5 text-[11px] font-bold transition disabled:opacity-50",
                            done ? "border-emerald-600 bg-emerald-600 text-white" : "border-line text-ink hover:border-emerald-600",
                          )}
                        >
                          <Check className="h-3 w-3" />
                          {done ? "Completed" : "Mark done"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <h2 className="text-[20px] font-bold leading-snug">{t.title}</h2>
                  )}

                  {/* Pre-Deadline Countdown & Escalation Alert Banner */}
                  {deadlineCountdownInfo && (
                    <div className={cn("mt-3 rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs", deadlineCountdownInfo.badgeClass)}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{deadlineCountdownInfo.icon}</span>
                        <div>
                          <div className="text-[12.5px] font-bold leading-tight">
                            {deadlineCountdownInfo.headline}
                          </div>
                          <div className="text-[11px] opacity-80 mt-0.5">
                            {deadlineCountdownInfo.sub}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={onTrackConfirmed}
                          onClick={confirmOnTrack}
                          className={cn(
                            "h-7 px-2.5 rounded text-[11.5px] font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5",
                            onTrackConfirmed
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{onTrackConfirmed ? "Confirmed On Track" : "On Track"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescheduleModalOpen(true)}
                          className="h-7 px-2.5 rounded border border-current/30 bg-white/80 dark:bg-[#161B22] text-[11.5px] font-semibold hover:bg-white transition cursor-pointer"
                        >
                          {deadlineCountdownInfo.btnLabel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Description (highlighted if missing per Point 9) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">Description</h3>
                    {!t.context?.trim() && (
                      <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                        ⚠️ Missing Brief / Details
                      </span>
                    )}
                  </div>
                  {can("context") ? (
                    <textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      onBlur={() => context !== (t.context ?? "") && onUpdate(t.id, { context })}
                      rows={4}
                      placeholder="Add a description, brief, or delivery specifications..."
                      className={cn(
                        "w-full resize-y rounded-[3px] border bg-surface p-2.5 text-[13px] leading-relaxed outline-none focus:border-[#0052CC]",
                        !t.context?.trim()
                          ? "border-amber-400 bg-amber-50/20 dark:border-amber-700"
                          : "border-line"
                      )}
                    />
                  ) : (
                    <div className="rounded-[3px] border border-line/60 p-2.5 text-[13px] bg-canvas/40">
                      {t.context ? <RichText text={t.context} /> : <span className="text-muted">No description provided.</span>}
                    </div>
                  )}
                </div>

                {/* Subtasks / Checklist (Point 4: Templates + Custom Subtask + Expandable Full Task Sheet) */}
                <div ref={subtasksRef}>
                  <Subtasks
                    projectId={t.id}
                    items={subtasks}
                    setItems={setSubtasks}
                    people={people}
                    canEdit
                    onError={setErr}
                    defaultReporter={t.createdByName || "Admin"}
                    defaultCampaign={t.campaignName}
                    campaigns={brand?.campaigns ?? []}
                  />
                </div>

                {/* Point 10: Live Project Costing (Budget vs Actual Cost) */}
                <ProjectCostingPanel
                  task={t}
                  people={people}
                  timeEntries={timeEntries}
                  viewer={viewer}
                />

                {/* Attachments */}
                <div ref={filesRef} className="space-y-1.5">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">Attachments</h3>
                  <Attachments projectId={t.id} items={attachments} setItems={setAttachments} onError={setErr} />
                </div>
              </div>

              {/* Right Jira Details Sidebar */}
              <div className="space-y-4">
                {/* Details Box (Point 3: Full edit rights on every field; Point 9: Highlight missing fields; Point 1: Hard Drive Picker) */}
                <div className="rounded-[3px] border border-line bg-surface p-3.5 space-y-3 shadow-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted border-b border-line pb-1.5 flex items-center justify-between">
                    <span>Project & Task Details</span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Full Edit Enabled</span>
                  </div>

                  <Row label="Status">
                    <StatusSelect t={t} disabled={!can("editStatus")} onUpdate={onUpdate} />
                  </Row>

                  <Row label="Assignee">
                    <div className={cn(
                      "flex items-center gap-1.5 rounded px-1 py-0.5",
                      !t.assigneeId && "border border-amber-400 bg-amber-50/40 dark:bg-amber-950/30"
                    )}>
                      {t.assigneeName ? <Avatar name={t.assigneeName} size={22} /> : <span className="h-5 w-5 rounded-full border border-dashed border-amber-500 text-amber-600 text-[10px] font-bold flex items-center justify-center">!</span>}
                      <CellSelect
                        value={t.assigneeId ?? ""}
                        disabled={!can("assigneeId")}
                        options={[{ value: "", label: "⚠️ Unassigned (Assign owner)" }, ...people.filter((p) => p.active || p.id === t.assigneeId).map((p) => ({ value: p.id, label: p.name }))]}
                        onChange={(v) => onUpdate(t.id, { assigneeId: v || null })}
                      />
                    </div>
                  </Row>

                  <Row label="Reporter">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                      <Avatar name={t.createdByName || "Admin"} size={22} />
                      <span>{t.createdByName || "Admin"}</span>
                    </div>
                  </Row>

                  <Row label="Brand">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[2px] shrink-0" style={{ background: brand?.color || "#0052CC" }} />
                      <CellSelect
                        value={t.brandId ?? ""}
                        disabled={!can("brandId")}
                        options={brands.map((b) => ({ value: b.id, label: b.name }))}
                        onChange={(v) => v && onUpdate(t.id, { brandId: v, campaignId: null })}
                      />
                    </div>
                  </Row>

                  <Row label="Campaign / Epic">
                    <div className={cn(
                      "flex items-center gap-1.5 min-w-0 rounded px-1 py-0.5",
                      !t.campaignId && "border border-amber-400 bg-amber-50/40 dark:bg-amber-950/30"
                    )}>
                      <div className="min-w-0 flex-1">
                        <CellSelect
                          value={t.campaignId ?? ""}
                          disabled={!can("campaignId")}
                          options={[
                            { value: "", label: "⚠️ Select campaign..." },
                            ...(brand?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name })),
                          ]}
                          onChange={(v) => {
                            if (v === "__create_campaign__") {
                              setCreateCampaignOpen(true);
                            } else {
                              onUpdate(t.id, { campaignId: v || null });
                            }
                          }}
                        />
                      </div>
                      {can("campaignId") && (
                        <button
                          type="button"
                          onClick={() => setCreateCampaignOpen(true)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition shrink-0 cursor-pointer"
                          title="Add new campaign"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </Row>

                  {/* Point 1: Hard Drive / Storage Management Picker */}
                  <Row label="Hard Drive">
                    <div className={cn(
                      "rounded p-0.5",
                      !t.storageId && "border border-amber-400 bg-amber-50/40 dark:bg-amber-950/30"
                    )}>
                      <StoragePicker
                        value={t.storageId}
                        storages={storages}
                        disabled={!can("storageId")}
                        onChange={(id) => onUpdate(t.id, { storageId: id })}
                        onCreated={onStorageCreated}
                        onError={setErr}
                      />
                    </div>
                  </Row>

                  <Row label="Priority">
                    <div className="flex items-center gap-1.5">
                      <JiraPriorityIcon priority={t.priority} />
                      <CellSelect value={t.priority} disabled={!can("priority")} options={opts(PRIORITIES)} onChange={set("priority")} />
                    </div>
                  </Row>

                  <Row label="Work Type">
                    <div className={cn(
                      "rounded px-1 py-0.5",
                      !t.workType && "border border-amber-400 bg-amber-50/40 dark:bg-amber-950/30"
                    )}>
                      <CellSelect
                        value={t.workType ?? ""}
                        disabled={!can("workType")}
                        options={[{ value: "", label: "⚠️ Select work type..." }, ...opts(WORK_TYPES)]}
                        onChange={set("workType")}
                      />
                    </div>
                  </Row>

                  <Row label="Issue Type">
                    <CellSelect value={t.type ?? ""} disabled={!can("type")} options={opts(TYPES)} onChange={set("type")} />
                  </Row>

                  <Row label="Internal Due">
                    <input
                      type="date"
                      disabled={!can("internalDeadline")}
                      value={toInputDate(t.internalDeadline)}
                      onChange={(e) => onUpdate(t.id, { internalDeadline: e.target.value || null })}
                      className={cn(
                        "cell-select font-medium",
                        !t.internalDeadline && "border border-amber-400 bg-amber-50/40 dark:bg-amber-950/30"
                      )}
                    />
                  </Row>

                  <Row label="Client Due">
                    <input
                      type="date"
                      disabled={!can("externalDeadline")}
                      value={toInputDate(t.externalDeadline)}
                      onChange={(e) => onUpdate(t.id, { externalDeadline: e.target.value || null })}
                      className="cell-select font-medium"
                    />
                  </Row>

                  {(t.brandRepositoryUrl || t.campaignRepositoryUrl) && (
                    <Row label="Repositories">
                      <div className="space-y-1">
                        {t.brandRepositoryUrl && (
                          <a
                            href={t.brandRepositoryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0052CC] hover:underline"
                          >
                            <FolderGit2 className="h-3 w-3" /> Brand Drive <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        {t.campaignRepositoryUrl && (
                          <a
                            href={t.campaignRepositoryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0052CC] hover:underline block"
                          >
                            <FolderGit2 className="h-3 w-3" /> Campaign Drive <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </Row>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* comments / activity */}
          <div ref={commentsRef} className="border-t border-line bg-canvas/50 px-4 pb-6 pt-3 md:px-6">
            <div className="mb-3 flex gap-4 text-[13px] border-b border-line pb-0.5">
              {(["updates", "standup", "activity", "time"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "border-b-2 pb-1.5 font-medium transition cursor-pointer",
                    tab === k ? "border-ink text-ink font-bold" : "border-transparent text-muted hover:text-ink"
                  )}
                >
                  {k === "updates"
                    ? `Comments${updates?.length ? ` (${updates.length})` : ""}`
                    : k === "standup"
                      ? "Daily Standup"
                      : k === "activity"
                        ? "All activity"
                        : `Time Logged (${Math.round(((t.totalDurationMinutes || 0) / 60) * 10) / 10}h)`}
                </button>
              ))}
            </div>

            {tab === "standup" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-line bg-surface p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h4 className="text-[13px] font-bold text-ink">Post Daily Standup / Cut Progress</h4>
                  </div>
                  <p className="text-[12px] text-muted">
                    Keep the team and management aligned with a 15-second daily update.
                  </p>

                  <form onSubmit={submitStandup} className="space-y-2.5">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1">
                        Today's Cut / Progress *
                      </label>
                      <input
                        required
                        value={standupProgress}
                        onChange={(e) => setStandupProgress(e.target.value)}
                        placeholder="e.g. Assembled rough cut v1 down to 58s, synced audio"
                        className="field-input w-full text-[13px] py-1.5"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1">
                          Next Action / Step
                        </label>
                        <input
                          value={standupNext}
                          onChange={(e) => setStandupNext(e.target.value)}
                          placeholder="e.g. Adding motion graphics lower-thirds"
                          className="field-input w-full text-[13px] py-1.5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1">
                          Blockers / Needs Help
                        </label>
                        <input
                          value={standupBlockers}
                          onChange={(e) => setStandupBlockers(e.target.value)}
                          placeholder="e.g. None, or Need high-res logos"
                          className="field-input w-full text-[13px] py-1.5"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={standupBusy || !standupProgress.trim()}
                        className="btn-primary text-[12px] py-1.5 px-4 font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="size-3.5" />
                        <span>{standupBusy ? "Posting..." : "Post Daily Standup"}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Standup History */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Standup Log History
                  </div>
                  {(updates?.filter((u) => u.body.includes("DAILY STANDUP")) ?? []).length === 0 ? (
                    <p className="text-[12px] text-muted py-2">No standup logs posted yet for this deliverable.</p>
                  ) : (
                    updates!
                      .filter((u) => u.body.includes("DAILY STANDUP"))
                      .map((u) => (
                        <div key={u.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[12.5px] space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted border-b border-line/40 pb-1">
                            <span className="font-semibold text-ink">{u.authorName}</span>
                            <span>{fmtDateTime(u.createdAt)}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-ink font-mono text-[12px] leading-relaxed pt-1">
                            {u.body}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {tab === "updates" && (
              <div className="space-y-4">
                {updates === null && <p className="text-[12px] text-muted">Loading…</p>}
                {updates?.length === 0 && <p className="text-[12px] text-muted">No comments yet. Ask a question or post an update below; type @ to mention someone.</p>}
                {updates?.map((u) => (
                  <div key={u.id} className="group flex gap-2.5">
                    <Avatar name={u.authorName} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center text-[12px]">
                        <span className="font-semibold">{u.authorName}</span>
                        <span className="ml-2 text-muted">{fmtDateTime(u.createdAt)}</span>
                        {u.id.startsWith("tmp-") && <span className="ml-2 text-[11px] text-muted">Sending…</span>}
                        {!u.id.startsWith("tmp-") && (u.authorId === viewerId || admin) && (
                          <button
                            className="ml-auto text-[11px] text-muted opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                            onClick={() => {
                              if (!confirm("Delete this comment?")) return;
                              setUpdates((x) => (x ?? []).filter((y) => y.id !== u.id));
                              deleteUpdate(u.id).catch((e) => {
                                setUpdates((x) => [...(x ?? []), u].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
                                setErr(e instanceof Error ? e.message : "Couldn't delete");
                              });
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <RichText text={u.body} names={names} />
                    </div>
                  </div>
                ))}
                <div ref={threadEnd} />
              </div>
            )}

            {tab === "activity" && (
              <ul className="space-y-2 text-[12px]">
                {activity.length === 0 && <li className="text-muted">No changes recorded yet.</li>}
                {activity.map((a) => (
                  <li key={a.id} className="text-muted">
                    {a.field === "Handover" ? (
                      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:border-amber-800 dark:text-amber-200">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">🤝 Handover:</span>
                        <span>
                          <span className="font-medium text-ink">{a.actorName}</span> handed over to <span className="font-semibold text-ink">{a.toValue}</span>
                        </span>
                        <span className="ml-auto text-[11px] text-muted">{fmtDateTime(a.createdAt)}</span>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-ink">{a.actorName}</span>{" "}
                        {a.fromValue != null || a.toValue != null ? (
                          <>changed <span className="text-ink">{a.field}</span>{a.fromValue ? <> from <span className="text-ink">{a.fromValue}</span></> : null} to <span className="text-ink">{a.toValue ?? "—"}</span></>
                        ) : (
                          <span className="text-ink">{a.field.toLowerCase()}</span>
                        )}
                        <span className="ml-2">{fmtDateTime(a.createdAt)}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {tab === "time" && (
              <div className="space-y-4">
                {/* Log Time Form */}
                <form onSubmit={onLogTime} className="rounded-lg border border-line bg-surface p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-[12px] font-medium text-ink">
                    <span>Log Work Duration</span>
                    <span className="text-muted font-normal">Who worked, for how long</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Duration (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        step={5}
                        value={logMins}
                        onChange={(e) => setLogMins(Number(e.target.value) || 0)}
                        className="field-input w-full text-[13px] py-1"
                        placeholder="e.g. 60"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Work Type</label>
                      <select
                        value={logWorkType}
                        onChange={(e) => setLogWorkType(e.target.value)}
                        className="cell-select w-full text-[13px] py-1"
                      >
                        {WORK_TYPES.map((wt) => (
                          <option key={wt} value={wt}>
                            {wt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        className="field-input w-full text-[13px] py-1"
                        placeholder="Assembly cut, audio sync..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={timeLoading || logMins <= 0}
                      className="btn-primary text-[12px] py-1 px-3"
                    >
                      {timeLoading ? "Logging…" : "Log Time"}
                    </button>
                  </div>
                </form>

                {/* Time logs list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px] text-muted px-1">
                    <span>Logged entries ({timeEntries?.length || 0})</span>
                    <span>
                      Total: <strong className="text-ink">{Math.round(((t.totalDurationMinutes || 0) / 60) * 10) / 10} hrs</strong>
                      {seeAll && t.cost != null && <> · <strong className="text-ink">₹{t.cost.toLocaleString()}</strong></>}
                    </span>
                  </div>

                  {timeEntries === null && <p className="text-[12px] text-muted">Loading time logs…</p>}
                  {timeEntries?.length === 0 && <p className="text-[12px] text-muted">No time logged on this deliverable yet.</p>}

                  {timeEntries?.map((entry) => (
                    <div key={entry.id} className="group flex items-center justify-between rounded-md border border-line/60 bg-surface px-3 py-2 text-[12px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={entry.userName} size={24} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{entry.userName}</span>
                            {entry.workType && (
                              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                {entry.workType}
                              </span>
                            )}
                            <span className="text-[11px] text-muted">{fmtDate(entry.date)}</span>
                          </div>
                          {entry.notes && <p className="text-[11px] text-muted truncate mt-0.5">{entry.notes}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="font-semibold text-ink">{entry.hours} hrs</div>
                          {seeAll && entry.cost > 0 && (
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">₹{entry.cost.toLocaleString()}</div>
                          )}
                        </div>
                        {(entry.userId === viewerId || admin) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm("Delete this time entry?")) return;
                              const prev = timeEntries;
                              setTimeEntries((cur) => (cur ?? []).filter((x) => x.id !== entry.id));
                              deleteTimeEntry(entry.id)
                                .then(() => {
                                  onUpdate(t.id, {
                                    totalDurationMinutes: Math.max(0, (t.totalDurationMinutes || 0) - entry.durationMinutes),
                                  });
                                })
                                .catch((e) => {
                                  setTimeEntries(prev);
                                  setErr(e instanceof Error ? e.message : "Couldn't delete time entry");
                                });
                            }}
                            className="text-muted opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                            title="Delete entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="relative border-t border-line px-4 pt-3 md:px-6">
          {mentionOptions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-1 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
              {mentionOptions.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(p.name);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-canvas"
                >
                  <Avatar name={p.name} size={20} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[11px] text-muted">{p.department}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Avatar name={me?.name ?? "You"} size={28} />
            <textarea
              ref={inputRef}
              value={draft}
              onFocus={() => setTab("updates")}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (mentionOptions.length && (e.key === "Enter" || e.key === "Tab")) {
                  e.preventDefault();
                  pickMention(mentionOptions[0].name);
                  return;
                }
                if (e.key === "Escape" && mentionQ !== null) {
                  e.stopPropagation();
                  setMentionQ(null);
                  return;
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
              }}
              rows={draft ? 3 : 1}
              placeholder="Ask a question or post an update…  (@ to mention, Ctrl+Enter to send)"
              className="field-input flex-1 resize-none"
            />
            <button onClick={post} disabled={!draft.trim()} className="btn-primary h-9" title="Send">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* collaborators */}
          <div className="flex flex-wrap items-center gap-2 py-2.5 text-[12px]">
            <span className="text-muted">Collaborators</span>
            {t.collaborators.map((c) => (
              <span key={c.id} className="group relative" title={c.name}>
                <Avatar name={c.name} size={26} />
                {canCollab && c.id !== viewerId && (
                  <button
                    onClick={() => collab("remove", c.id)}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] leading-none text-surface group-hover:flex"
                    title={`Remove ${c.name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {canCollab && (
              <label className="relative flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border border-dashed border-muted/60 text-muted hover:border-ink hover:text-ink" title="Add collaborator">
                <UserPlus className="h-3.5 w-3.5" />
                <select
                  value=""
                  onChange={(e) => e.target.value && collab("add", e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Add collaborator"
                >
                  <option value="">Add collaborator</option>
                  {people
                    .filter((p) => p.active && p.id !== t.assigneeId && !t.collaboratorIds.includes(p.id))
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            {isCollaborator && (
              <button onClick={() => collab("remove", viewerId)} className="ml-auto text-muted hover:text-ink">
                Leave task
              </button>
            )}
          </div>
        </div>
        {/* Reschedule / Timeline Change Modal */}
        {rescheduleModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            onClick={() => setRescheduleModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-amber-600" />
                  <h3 className="text-[15px] font-bold text-ink">Request Timeline Extension</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="rounded p-1 text-muted hover:text-ink cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Let studio management know why more time is needed so client air-dates can be safeguarded or assistance allocated.
              </p>

              {t.externalDeadline && (
                <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 text-[11.5px] text-amber-800 dark:text-amber-300">
                  <strong>Client Air Date:</strong> {fmtDate(t.externalDeadline)}
                </div>
              )}

              <form onSubmit={submitReschedule} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1">
                    Proposed New Delivery Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newProposedDate}
                    onChange={(e) => setNewProposedDate(e.target.value)}
                    className="field-input w-full text-[13px] py-1.5"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1">
                    Reason for Extension *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="e.g. Client provided additional 40GB raw footage today, or render crashed."
                    className="field-input w-full text-[13px] resize-none py-1.5 leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setRescheduleModalOpen(false)}
                    className="jira-btn-subtle px-3 py-1.5 text-[12px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rescheduleBusy || !newProposedDate || !rescheduleReason.trim()}
                    className="btn-primary text-[12px] py-1.5 px-4 font-bold cursor-pointer"
                  >
                    {rescheduleBusy ? "Sending..." : "Submit Extension Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Stop Work Session & Log Progress Modal */}
        {stopSessionModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
            onClick={() => setStopSessionModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-[#2C3B53] dark:bg-[#161B22]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-amber-600" />
                  <h3 className="text-[15px] font-bold text-ink">
                    Log Work Session · {t.code}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setStopSessionModalOpen(false)}
                  className="rounded p-1 text-muted hover:text-ink cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmStopSession} className="mt-4 space-y-3.5">
                <div className="rounded-lg bg-canvas p-2.5 border border-line text-[12px]">
                  <div className="font-semibold text-ink">{t.title}</div>
                  <div className="text-muted text-[11px] mt-0.5">
                    {t.brandName} {t.campaignName && `· ${t.campaignName}`}
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
                      value={stopModalMinutes}
                      onChange={(e) => setStopModalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                      className="field-input w-28 font-mono text-[13px] font-bold text-center"
                    />
                    <span className="text-[12px] text-muted font-medium">
                      ({(stopModalMinutes / 60).toFixed(1)} hours)
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                      {[15, 30, 60, 120].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setStopModalMinutes(m)}
                          className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] font-semibold text-muted hover:text-ink hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
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
                    value={stopModalWorkType}
                    onChange={(e) => setStopModalWorkType(e.target.value)}
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
                    value={stopModalNotes}
                    onChange={(e) => setStopModalNotes(e.target.value)}
                    placeholder="e.g. Cut first 45 seconds, matched B-roll hooks, audio synced with tempo. Ready for review."
                    className="field-input w-full text-[12.5px] py-1.5 leading-relaxed resize-none"
                  />
                </div>

                {/* Mark as Submitted Checkbox */}
                <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 p-2.5 text-[12px] cursor-pointer hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={stopModalMarkSubmitted}
                    onChange={(e) => setStopModalMarkSubmitted(e.target.checked)}
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
                    onClick={() => setStopSessionModalOpen(false)}
                    className="btn-ghost py-1.5 px-3 text-[12px] cursor-pointer"
                    disabled={stopModalBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={stopModalBusy || stopModalMinutes <= 0}
                    className="btn-primary py-1.5 px-4 text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="size-3.5" />
                    <span>{stopModalBusy ? "Logging..." : "Submit Progress & Send Report"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <CreateCampaignModal
          isOpen={createCampaignOpen}
          onClose={() => setCreateCampaignOpen(false)}
          brandId={brand?.id || t.brandId || ""}
          brandName={brand?.name || t.brandName || "Brand"}
          brands={brands.map((b) => ({ id: b.id, name: b.name }))}
          onCreated={(campaign) => {
            onUpdate(t.id, { campaignId: campaign.id });
          }}
        />
      </aside>
    </>
  );
}
