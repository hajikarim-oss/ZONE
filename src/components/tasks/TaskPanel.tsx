"use client";

import { Archive, ArchiveRestore, MessageSquare, Send, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { addCollaborator, addUpdate, deleteTask, deleteUpdate, getTaskThread, removeCollaborator, setArchived, type ActivityDTO, type AttachmentDTO, type SubtaskDTO, type UpdateDTO } from "@/lib/actions";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPTS, EDIT_STATUSES, FINAL_APPROVAL, PLATFORMS,
  PREPRO_STAGES, PRIORITIES, REVISION_ROUNDS, SCRIPT_STAGES, SHOOT_STATUSES, TYPES,
} from "@/lib/constants";
import type { BrandDTO, PersonDTO, StorageDTO, TaskDTO } from "@/lib/dto";
import { canEditField, canManageCollaborators } from "@/lib/rbac";
import { cn, fmtDate, fmtDateTime, fromInputDateTime, toInputDate, toInputDateTime } from "@/lib/utils";
import { CellSelect, DelayBadge, opts, StagePill, StatusSelect } from "./bits";
import { Attachments, StoragePicker, Subtasks } from "./TaskExtras";

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

  useEffect(() => {
    setTitle(t.title);
    setNotes(t.notes ?? "");
    setContext(t.context ?? "");
  }, [t.id, t.title, t.notes, t.context]);

  // Load comments + history when a task opens ("Loading…" only then). After an
  // edit, refresh quietly a moment later so the history catches up.
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const first = openedId.current !== t.id;
    openedId.current = t.id;
    if (first) {
      setUpdates(null);
      setSubtasksRaw(null);
      setAttachmentsRaw(null);
    }
    const timer = setTimeout(
      () =>
        getTaskThread(t.id)
          .then((r) => {
            if (!live) return;
            setUpdates((cur) => [...r.updates, ...(cur ?? []).filter((u) => u.id.startsWith("tmp-"))]);
            setActivity(r.activity);
            setSubtasksRaw((cur) => [...r.subtasks, ...(cur ?? []).filter((x) => x.id.startsWith("tmp-"))]);
            setAttachmentsRaw(r.attachments);
          })
          .catch(() => live && first && setUpdates([])),
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
  const set = (field: string) => (v: string) => onUpdate(t.id, { [field]: field === "revisionRound" ? Number(v) : v });

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
          {err && (
            <button onClick={() => setErr(null)} className="mb-3 block w-full rounded-md bg-rose-50 px-3 py-2 text-left text-[12px] text-rose-700">
              {err} <span className="text-rose-400">(dismiss)</span>
            </button>
          )}
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
            <Row label="Status">
              <div className="w-40 px-1">
                <StatusSelect t={t} disabled={!can("editStatus")} onUpdate={onUpdate} />
              </div>
            </Row>
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
            <Row label="Brand">
              <CellSelect
                value={t.brandId ?? ""}
                disabled={!can("brandId")}
                options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
                onChange={(v) => onUpdate(t.id, { brandId: v || null })}
              />
            </Row>
            <Row label="Start">
              <input
                type="datetime-local"
                disabled={!can("startAt")}
                value={toInputDateTime(t.startAt)}
                onChange={(e) => onUpdate(t.id, { startAt: fromInputDateTime(e.target.value) })}
                className="cell-select"
                title="When the work started"
              />
            </Row>
            <Row label="End">
              <input
                type="datetime-local"
                disabled={!can("endAt")}
                value={toInputDateTime(t.endAt)}
                onChange={(e) => onUpdate(t.id, { endAt: fromInputDateTime(e.target.value) })}
                className="cell-select"
                title="When it's planned to end / be delivered (can be the same day as Start, different time)"
              />
            </Row>
            <Row label="Due date">
              <input
                type="date"
                disabled={!can("internalDeadline")}
                value={toInputDate(t.internalDeadline)}
                onChange={(e) => onUpdate(t.id, { internalDeadline: e.target.value || null })}
                className="cell-select"
                title="When it should be complete"
              />
            </Row>
            {seeAll && (
              <Row label="Client deadline">
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
                  {seeAll ? `Team ×${t.intDeadlineChanges} · Client ×${t.extDeadlineChanges}` : `×${t.intDeadlineChanges}`}
                </span>
              </Row>
            )}
            <Row label="Storage">
              <StoragePicker
                value={t.storageId}
                storages={storages}
                disabled={!can("storageId")}
                onChange={(id) => onUpdate(t.id, { storageId: id })}
                onCreated={onStorageCreated}
                onError={setErr}
              />
            </Row>
            <Row label="Priority"><CellSelect value={t.priority} disabled={!can("priority")} options={opts(PRIORITIES)} onChange={set("priority")} /></Row>
            <Row label="Type"><CellSelect value={t.type ?? ""} disabled={!can("type")} options={opts(TYPES)} onChange={set("type")} /></Row>
            <Row label="Platform"><CellSelect value={t.platform ?? ""} disabled={!can("platform")} options={opts(PLATFORMS)} onChange={set("platform")} /></Row>
            <Row label="Dept"><CellSelect value={t.dept} disabled={!can("dept")} options={opts(DEPTS)} onChange={set("dept")} /></Row>
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

          <h3 className="mb-1.5 mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">Description</h3>
          {can("context") ? (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={() => context !== (t.context ?? "") && onUpdate(t.id, { context })}
              rows={3}
              placeholder="Brief, references, what the team needs to know…"
              className="field-input resize-y"
            />
          ) : (
            <div className="rounded-md bg-canvas px-3 py-2 text-[13px]">{t.context ? <RichText text={t.context} /> : <span className="text-muted">No description yet</span>}</div>
          )}

          <Subtasks projectId={t.id} items={subtasks} setItems={setSubtasks} people={people} canEdit onError={setErr} />
          <Attachments projectId={t.id} items={attachments} setItems={setAttachments} onError={setErr} />

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
