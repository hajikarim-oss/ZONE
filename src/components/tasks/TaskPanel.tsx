"use client";

import { Archive, ArchiveRestore, Clipboard, ExternalLink, MessageSquare, Paperclip, PauseCircle, Plus, Send, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import {
  addAttachment, addCollaborator, addUpdate, createStorageDevice, createTask,
  deleteAttachment, deleteTask, deleteUpdate, getAttachments, getSubtasks, getTaskThread,
  listStorageDevices, removeCollaborator, setArchived,
  type ActivityDTO, type UpdateDTO,
} from "@/lib/actions";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPTS, EDIT_STATUSES, FINAL_APPROVAL, PLATFORMS,
  PREPRO_STAGES, PRIORITIES, REVISION_ROUNDS, SCRIPT_STAGES, SHOOT_STATUSES, TYPES,
} from "@/lib/constants";
import type { AttachmentDTO, BrandDTO, PersonDTO, StorageDeviceDTO, TaskDTO } from "@/lib/dto";
import { canEditField, canManageCollaborators } from "@/lib/rbac";
import { cn, fmtDate, fmtDateTime, toInputDate } from "@/lib/utils";
import { CellSelect, DelayBadge, opts, StagePill } from "./bits";

type Props = {
  task: TaskDTO;
  people: PersonDTO[];
  brands: BrandDTO[];
  viewer: { id: string; role: string; seeAll: boolean; admin: boolean };
  onClose: () => void;
  onOpen?: (id: string) => void;
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

function isDriveLink(url: string) {
  return /drive\.google\.com|docs\.google\.com/i.test(url);
}

function AttachmentItem({ a, canDelete, onDelete }: { a: AttachmentDTO; canDelete: boolean; onDelete: () => void }) {
  const isGDrive = isDriveLink(a.url);
  const display = a.label || (a.url.length > 55 ? a.url.slice(0, 52) + "…" : a.url);
  return (
    <div className="group flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-[13px]">
      {isGDrive ? (
        <svg className="h-4 w-4 shrink-0 text-[#4285F4]" viewBox="0 0 87.3 78" fill="currentColor">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA" />
          <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.4C.4 49.8 0 51.35 0 52.9h27.5z" fill="#00AC47" />
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#EA4335" />
          <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D" />
          <path d="M59.8 52.9h27.5c0-1.55-.4-3.1-1.2-4.5L60.7 4.5C59.9 3.1 58.75 2 57.4 1.2L43.65 25z" fill="#2684FC" />
          <path d="M43.65 25L27.5 52.9h32.3L43.65 25z" fill="#FFBA00" />
        </svg>
      ) : (
        <Paperclip className="h-4 w-4 shrink-0 text-muted" />
      )}
      <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent hover:underline">
        {display}
      </a>
      <span className="shrink-0 text-[11px] text-muted">{fmtDate(a.createdAt)}</span>
      {canDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-muted opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function TaskPanel({ task: t, people, brands, viewer, onClose, onOpen, onUpdate, onRemoved, onReplace }: Props) {
  const { seeAll, admin, id: viewerId } = viewer;
  const [updates, setUpdates] = useState<UpdateDTO[] | null>(null);
  const [activity, setActivity] = useState<ActivityDTO[]>([]);
  const [tab, setTab] = useState<"updates" | "activity">("updates");
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

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentDTO[] | null>(null);
  const [attachUrl, setAttachUrl] = useState("");
  const [attachLabel, setAttachLabel] = useState("");
  const [showAttachForm, setShowAttachForm] = useState(false);

  // Storage devices
  const [storageDevices, setStorageDevices] = useState<StorageDeviceDTO[]>([]);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [showNewDevice, setShowNewDevice] = useState(false);

  // Subtasks
  const [subtasks, setSubtasks] = useState<TaskDTO[] | null>(null);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  useEffect(() => {
    setTitle(t.title);
    setNotes(t.notes ?? "");
    setContext(t.context ?? "");
  }, [t.id, t.title, t.notes, t.context]);

  // Load comments + history when a task opens
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const first = openedId.current !== t.id;
    openedId.current = t.id;
    if (first) {
      setUpdates(null);
      setAttachments(null);
      setSubtasks(null);
    }
    const timer = setTimeout(
      () =>
        getTaskThread(t.id)
          .then((r) => {
            if (!live) return;
            setUpdates((cur) => [...r.updates, ...(cur ?? []).filter((u) => u.id.startsWith("tmp-"))]);
            setActivity(r.activity);
          })
          .catch(() => live && first && setUpdates([])),
      first ? 0 : 1200,
    );
    // Load attachments
    getAttachments(t.id).then((a) => { if (live) setAttachments(a); }).catch(() => { if (live) setAttachments([]); });
    // Load subtasks
    getSubtasks(t.id).then((subs) => { if (live) setSubtasks(subs); }).catch(() => { if (live) setSubtasks([]); });
    // Load storage devices
    listStorageDevices().then((d) => { if (live) setStorageDevices(d); }).catch(() => {});
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

  // @mention autocomplete
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
  const set = (field: string) => (v: string) => onUpdate(t.id, { [field]: field === "revisionRound" ? Number(v) : v });

  // Comment
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

  // Attachments
  function submitAttachment(e: React.FormEvent) {
    e.preventDefault();
    const url = attachUrl.trim();
    if (!url) return;
    start(async () => {
      try {
        const a = await addAttachment(t.id, url, attachLabel);
        setAttachments((x) => [...(x ?? []), a]);
        setAttachUrl("");
        setAttachLabel("");
        setShowAttachForm(false);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "Couldn't add attachment");
      }
    });
  }

  function removeAttachment(id: string) {
    if (!confirm("Remove this attachment?")) return;
    setAttachments((x) => (x ?? []).filter((a) => a.id !== id));
    deleteAttachment(id).catch((e) => {
      setErr(e instanceof Error ? e.message : "Couldn't remove attachment");
      // re-fetch on failure
      getAttachments(t.id).then(setAttachments).catch(() => {});
    });
  }

  // Storage device quick-create
  async function addNewDevice() {
    const name = newDeviceName.trim();
    if (!name) return;
    try {
      const d = await createStorageDevice(name);
      setStorageDevices((prev) => [...prev, d].sort((a, b) => a.name.localeCompare(b.name)));
      onUpdate(t.id, { storageDeviceId: d.id });
      setNewDeviceName("");
      setShowNewDevice(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't create device");
    }
  }

  // Subtask creation
  function submitSubtask(e: React.FormEvent) {
    e.preventDefault();
    const titleTrimmed = newSubtaskTitle.trim();
    if (!titleTrimmed) return;
    start(async () => {
      try {
        const sub = await createTask({ title: titleTrimmed, parentId: t.id, brandId: t.brandId });
        setSubtasks((x) => [...(x ?? []), sub]);
        setNewSubtaskTitle("");
        setShowSubtaskForm(false);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "Couldn't add subtask");
      }
    });
  }

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-surface md:static md:z-auto md:h-full md:w-[560px] md:shrink-0 md:border-l md:border-line md:shadow-panel">
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <StagePill t={t} />
        <DelayBadge t={t} />
        <div className="ml-auto flex items-center gap-1">
          <button
            className="btn-ghost gap-1.5 px-2 text-[12px]"
            title="Jump to comments"
            onClick={() => {
              setTab("updates");
              setTimeout(() => {
                commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                inputRef.current?.focus();
              }, 50);
            }}
          >
            <MessageSquare className="h-4 w-4" />
            Comments{updates?.length ? ` (${updates.length})` : ""}
          </button>
          {seeAll && (
            <button
              className="btn-ghost px-2"
              title={t.archived ? "Move back to active" : "Move to Completed"}
              onClick={() => { onRemoved(t.id); setArchived(t.id, !t.archived).catch(() => alert("Couldn't move it. Refresh and try again.")); }}
            >
              {t.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </button>
          )}
          {admin && (
            <button
              className="btn-ghost px-2 text-rose-600"
              title="Delete"
              onClick={() => {
                if (!confirm(`Delete ${t.code} "${t.title}"? This can't be undone. Move it to Completed instead to keep the history.`)) return;
                onRemoved(t.id);
                deleteTask(t.id).catch(() => alert("Couldn't delete it. Refresh and try again."));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button className="btn-ghost px-2" onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="px-4 pb-4 pt-5 md:px-6">
          <div className="mb-1 text-[11px] text-muted">{t.code} · added {fmtDate(t.addedOn, true)}</div>
          {can("title") ? (
            <textarea
              value={title}
              rows={1}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== t.title && onUpdate(t.id, { title })}
              className="-mx-2 w-full resize-none rounded-md border border-transparent px-2 py-1 text-[20px] font-semibold leading-snug outline-none hover:border-line focus:border-accent"
            />
          ) : (
            <h2 className="text-[20px] font-semibold leading-snug">{t.title}</h2>
          )}

          <div className="mt-4 space-y-0.5">
            <Row label="Assignee">
              <CellSelect
                value={t.assigneeId ?? ""}
                disabled={!can("assigneeId")}
                options={[{ value: "", label: "Unassigned" }, ...people.filter((p) => p.active || p.id === t.assigneeId).map((p) => ({ value: p.id, label: `${p.name} · ${p.department}` }))]}
                onChange={(v) => onUpdate(t.id, { assigneeId: v || null })}
              />
            </Row>
            <Row label="Collaborators">
              <div className="flex flex-wrap items-center gap-1.5 px-1 py-0.5">
                {t.collaborators.length === 0 && !canCollab && <span className="px-1 text-[13px] text-muted">None</span>}
                {t.collaborators.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-canvas py-0.5 pl-0.5 pr-2 text-[12px]">
                    <Avatar name={c.name} size={18} />
                    {c.name}
                    {(canCollab || c.id === viewerId) && (
                      <button onClick={() => collab("remove", c.id)} className="text-muted hover:text-ink" title={c.id === viewerId ? "Leave this task" : "Remove"}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {canCollab && (
                  <label className="relative inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[12px] text-muted hover:border-muted hover:text-ink">
                    <UserPlus className="h-3 w-3" /> Add
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
              </div>
            </Row>
            {t.createdByName && (
              <Row label="Added by">
                <span className="px-2 text-[13px]">{t.createdByName}</span>
              </Row>
            )}
            <Row label="On hold">
              <button
                disabled={!can("onHold")}
                onClick={() => onUpdate(t.id, { onHold: !t.onHold })}
                className={cn(
                  "ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium disabled:cursor-default",
                  t.onHold ? "bg-amber-50 text-amber-700" : "bg-canvas text-muted hover:text-ink",
                )}
                title={can("onHold") ? (t.onHold ? "Take off hold" : "Put on hold (pauses reminders)") : undefined}
              >
                <PauseCircle className="h-3.5 w-3.5" />
                {t.onHold ? "On hold" : "No"}
              </button>
            </Row>
            <Row label="Brand">
              <CellSelect
                value={t.brandId ?? ""}
                disabled={!can("brandId")}
                options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
                onChange={(v) => onUpdate(t.id, { brandId: v || null })}
              />
            </Row>

            {/* ── Three date fields ── */}
            <Row label="Start date">
              <input
                type="datetime-local"
                disabled={!can("startDate")}
                value={t.startDate ? t.startDate.slice(0, 16) : ""}
                onChange={(e) => onUpdate(t.id, { startDate: e.target.value || null })}
                className="cell-select"
              />
            </Row>
            <Row label="End date">
              <input
                type="datetime-local"
                disabled={!can("internalDeadline")}
                value={t.internalDeadline ? t.internalDeadline.slice(0, 16) : ""}
                onChange={(e) => onUpdate(t.id, { internalDeadline: e.target.value || null })}
                className="cell-select"
              />
            </Row>
            {seeAll && (
              <Row label="Due date">
                <input
                  type="date"
                  disabled={!can("externalDeadline")}
                  value={toInputDate(t.externalDeadline)}
                  onChange={(e) => onUpdate(t.id, { externalDeadline: e.target.value || null })}
                  className="cell-select"
                />
              </Row>
            )}
            {(t.intDeadlineChanges > 0 || (seeAll && t.extDeadlineChanges > 0)) && (
              <Row label="Deadline pushed">
                <span className="px-2 text-[12px] text-amber-700">
                  {seeAll ? `End ×${t.intDeadlineChanges} · Due ×${t.extDeadlineChanges}` : `×${t.intDeadlineChanges}`}
                </span>
              </Row>
            )}

            <Row label="Priority"><CellSelect value={t.priority} disabled={!can("priority")} options={opts(PRIORITIES)} onChange={set("priority")} /></Row>
            <Row label="Type"><CellSelect value={t.type ?? ""} disabled={!can("type")} options={opts(TYPES)} onChange={set("type")} /></Row>
            <Row label="Platform"><CellSelect value={t.platform ?? ""} disabled={!can("platform")} options={opts(PLATFORMS)} onChange={set("platform")} /></Row>
            <Row label="Dept"><CellSelect value={t.dept} disabled={!can("dept")} options={opts(DEPTS)} onChange={set("dept")} /></Row>

            {/* Storage Name */}
            <Row label="Storage">
              {showNewDevice ? (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addNewDevice(); if (e.key === "Escape") setShowNewDevice(false); }}
                    placeholder="Device name…"
                    className="field-input flex-1 py-0.5 text-[13px]"
                  />
                  <button onClick={addNewDevice} className="btn-primary px-2 py-0.5 text-[12px]">Add</button>
                  <button onClick={() => setShowNewDevice(false)} className="btn-ghost px-2 py-0.5 text-[12px]">×</button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <CellSelect
                    value={t.storageDeviceId ?? ""}
                    disabled={!can("storageDeviceId")}
                    placeholder="None"
                    options={[{ value: "", label: "None" }, ...storageDevices.map((d) => ({ value: d.id, label: d.name }))]}
                    onChange={(v) => onUpdate(t.id, { storageDeviceId: v || null })}
                  />
                  {can("storageDeviceId") && (
                    <button onClick={() => setShowNewDevice(true)} className="btn-ghost px-1.5 py-0.5 text-[11px] text-muted hover:text-ink" title="Add new storage device">
                      + New
                    </button>
                  )}
                </div>
              )}
            </Row>

            {/* Estimated hours (admin/manager only) */}
            {seeAll && (
              <Row label="Est. hours">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  disabled={!can("estimatedHours")}
                  value={t.estimatedHours ?? ""}
                  onChange={(e) => onUpdate(t.id, { estimatedHours: e.target.value ? Number(e.target.value) : null })}
                  placeholder="—"
                  className="cell-select w-24"
                />
              </Row>
            )}
          </div>

          <h3 className="mb-1 mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">Pipeline</h3>
          <div className="space-y-0.5">
            <Row label="Brief"><CellSelect value={t.briefStage} disabled={!can("briefStage")} options={opts(BRIEF_STAGES)} onChange={set("briefStage")} /></Row>
            <Row label="Concept / script"><CellSelect value={t.scriptStage} disabled={!can("scriptStage")} options={opts(SCRIPT_STAGES)} onChange={set("scriptStage")} /></Row>
            <Row label="Pre-pro"><CellSelect value={t.preProStage} disabled={!can("preProStage")} options={opts(PREPRO_STAGES)} onChange={set("preProStage")} /></Row>
            <Row label="Shoot"><CellSelect value={t.shootStatus} disabled={!can("shootStatus")} options={opts(SHOOT_STATUSES)} onChange={set("shootStatus")} /></Row>
            <Row label="Edit status"><CellSelect value={t.editStatus} disabled={!can("editStatus")} options={opts(EDIT_STATUSES)} onChange={set("editStatus")} /></Row>
            <Row label="Revision round"><CellSelect value={String(t.revisionRound)} disabled={!can("revisionRound")} options={opts(REVISION_ROUNDS)} onChange={set("revisionRound")} /></Row>
            <Row label="Client review"><CellSelect value={t.clientReview} disabled={!can("clientReview")} options={opts(CLIENT_REVIEW)} onChange={set("clientReview")} /></Row>
            <Row label="Final approval"><CellSelect value={t.finalApproval} disabled={!can("finalApproval")} options={opts(FINAL_APPROVAL)} onChange={set("finalApproval")} /></Row>
            <Row label="Delivery"><CellSelect value={t.deliveryStatus} disabled={!can("deliveryStatus")} options={opts(DELIVERY_STATUSES)} onChange={set("deliveryStatus")} /></Row>
          </div>

          {/* Subtasks */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Subtasks{t.subtaskCount > 0 ? ` (${t.subtaskCount})` : ""}
              </h3>
              {!t.parentId && (
                <button
                  onClick={() => setShowSubtaskForm((v) => !v)}
                  className="btn-ghost gap-1 px-2 py-0.5 text-[12px]"
                >
                  <Plus className="h-3 w-3" /> Add subtask
                </button>
              )}
            </div>
            {t.parentId && (
              <p className="mb-2 text-[12px] text-muted">This is a subtask. Subtasks can't have their own subtasks.</p>
            )}
            {showSubtaskForm && (
              <form onSubmit={submitSubtask} className="mb-2 flex items-center gap-2">
                <input
                  autoFocus
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Subtask name…"
                  className="field-input flex-1 text-[13px]"
                />
                <button type="submit" className="btn-primary px-2 py-0.5 text-[12px]">Add</button>
                <button type="button" onClick={() => setShowSubtaskForm(false)} className="btn-ghost px-2 py-0.5 text-[12px]">Cancel</button>
              </form>
            )}
            {subtasks && subtasks.length > 0 && (
              <div className="space-y-1">
                {subtasks.map((s) => (
                  <div
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-[13px] hover:bg-surface"
                    onClick={() => onOpen?.(s.id)}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full border border-muted/50" />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 text-[11px] text-muted">{s.code}</span>
                  </div>
                ))}
              </div>
            )}
            {subtasks?.length === 0 && !showSubtaskForm && (
              <p className="text-[12px] text-muted">No subtasks yet.</p>
            )}
          </div>

          {/* Attachments */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Attachments{attachments?.length ? ` (${attachments.length})` : ""}
              </h3>
              <button
                onClick={() => setShowAttachForm((v) => !v)}
                className="btn-ghost gap-1 px-2 py-0.5 text-[12px]"
              >
                <Paperclip className="h-3 w-3" /> Add link
              </button>
            </div>
            {showAttachForm && (
              <form onSubmit={submitAttachment} className="mb-3 space-y-2">
                <input
                  autoFocus
                  value={attachUrl}
                  onChange={(e) => setAttachUrl(e.target.value)}
                  placeholder="Paste a Google Drive or any URL…"
                  className="field-input w-full text-[13px]"
                  type="url"
                />
                <div className="flex gap-2">
                  <input
                    value={attachLabel}
                    onChange={(e) => setAttachLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="field-input flex-1 text-[13px]"
                  />
                  <button type="submit" disabled={!attachUrl.trim()} className="btn-primary px-3 text-[12px]">Save</button>
                  <button type="button" onClick={() => setShowAttachForm(false)} className="btn-ghost px-3 text-[12px]">Cancel</button>
                </div>
              </form>
            )}
            {attachments === null && <p className="text-[12px] text-muted">Loading…</p>}
            {attachments?.length === 0 && !showAttachForm && (
              <p className="text-[12px] text-muted">No attachments. Paste a Drive link or any URL above.</p>
            )}
            {attachments && attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((a) => (
                  <AttachmentItem
                    key={a.id}
                    a={a}
                    canDelete={a.addedById === viewerId || seeAll}
                    onDelete={() => removeAttachment(a.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <h3 className="mb-1.5 mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">Context for the team</h3>
          {seeAll ? (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={() => context !== (t.context ?? "") && onUpdate(t.id, { context })}
              rows={3}
              placeholder="Brief, references, what the assignee needs to know…"
              className="field-input resize-y"
            />
          ) : (
            <div className="rounded-md bg-canvas px-3 py-2 text-[13px]">{t.context ? <RichText text={t.context} /> : <span className="text-muted">No context added</span>}</div>
          )}

          {seeAll && (
            <>
              <h3 className="mb-1.5 mt-5 text-[12px] font-semibold uppercase tracking-wide text-muted">Internal notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (t.notes ?? "") && onUpdate(t.id, { notes })}
                rows={2}
                placeholder="Only admins and managers see this"
                className="field-input resize-y"
              />
            </>
          )}
        </div>

        {/* updates / activity */}
        <div ref={commentsRef} className="border-t border-line bg-canvas/50 px-4 pb-6 pt-3 md:px-6">
          <div className="mb-3 flex gap-4 text-[13px]">
            {(["updates", "activity"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("border-b-2 pb-1.5 font-medium capitalize", tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {k === "updates" ? `Comments${updates?.length ? ` (${updates.length})` : ""}` : "Activity"}
              </button>
            ))}
          </div>

          {tab === "updates" && (
            <div className="space-y-4">
              {updates === null && <p className="text-[12px] text-muted">Loading…</p>}
              {updates?.length === 0 && (
                <p className="text-[12px] text-muted">
                  No comments yet. Post progress notes, Drive links or questions here. Type @ to mention someone.
                </p>
              )}
              {updates?.map((u) => (
                <div key={u.id} className="group flex gap-2.5">
                  <Avatar name={u.authorName} size={26} />
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
                  <span className="font-medium text-ink">{a.actorName}</span>{" "}
                  {a.fromValue != null || a.toValue != null ? (
                    <>changed <span className="text-ink">{a.field}</span>{a.fromValue ? <> from <span className="text-ink">{a.fromValue}</span></> : null} to <span className="text-ink">{a.toValue ?? "—"}</span></>
                  ) : (
                    <span className="text-ink">{a.field.toLowerCase()}</span>
                  )}
                  <span className="ml-2">{fmtDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {tab === "updates" && (
        <div className="relative border-t border-line px-4 py-3">
          {err && <p className="mb-2 text-[12px] text-rose-600">{err}</p>}
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
            <textarea
              ref={inputRef}
              value={draft}
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
              rows={2}
              placeholder="Add a comment… type @ to mention someone (Ctrl+Enter to send)"
              className="field-input flex-1 resize-none"
            />
            <button onClick={post} disabled={!draft.trim()} className="btn-primary h-9">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
