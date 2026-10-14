"use client";

import { Archive, ArchiveRestore, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { addUpdate, deleteTask, getTaskThread, setArchived, type ActivityDTO, type UpdateDTO } from "@/lib/actions";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPTS, EDIT_STATUSES, FINAL_APPROVAL, PLATFORMS,
  PREPRO_STAGES, PRIORITIES, REVISION_ROUNDS, SCRIPT_STAGES, SHOOT_STATUSES, TYPES,
} from "@/lib/constants";
import type { BrandDTO, PersonDTO, TaskDTO } from "@/lib/dto";
import { MEMBER_FIELDS } from "@/lib/rbac";
import { cn, fmtDate, fmtDateTime, toInputDate } from "@/lib/utils";
import { CellSelect, DelayBadge, opts, StagePill } from "./bits";

type Props = {
  task: TaskDTO;
  people: PersonDTO[];
  brands: BrandDTO[];
  seeAll: boolean;
  admin: boolean;
  viewerId: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRemoved: (id: string) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-2 py-0.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Linkify drive links etc. in updates
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
            {p.length > 60 ? p.slice(0, 57) + "…" : p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export default function TaskPanel({ task: t, people, brands, seeAll, admin, viewerId, onClose, onUpdate, onRemoved }: Props) {
  const [updates, setUpdates] = useState<UpdateDTO[] | null>(null);
  const [activity, setActivity] = useState<ActivityDTO[]>([]);
  const [tab, setTab] = useState<"updates" | "activity">("updates");
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
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

  useEffect(() => {
    let live = true;
    setUpdates(null);
    getTaskThread(t.id)
      .then((r) => {
        if (!live) return;
        setUpdates(r.updates);
        setActivity(r.activity);
      })
      .catch(() => live && setUpdates([]));
    return () => {
      live = false;
    };
  }, [t.id, t.updatedAt]);

  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const can = (field: string) => seeAll || (t.assigneeId === viewerId && MEMBER_FIELDS.has(field));
  const set = (field: string) => (v: string) => onUpdate(t.id, { [field]: field === "revisionRound" ? Number(v) : v });

  function post() {
    if (!draft.trim()) return;
    setErr(null);
    start(async () => {
      try {
        const u = await addUpdate(t.id, draft);
        setUpdates((x) => [...(x ?? []), u]);
        setDraft("");
        setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't post");
      }
    });
  }

  return (
    <aside className="flex h-full w-[560px] shrink-0 flex-col border-l border-line bg-surface shadow-panel">
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <StagePill t={t} />
        <DelayBadge t={t} />
        <div className="ml-auto flex items-center gap-1">
          {seeAll && (
            <button
              className="btn-ghost px-2"
              title={t.archived ? "Move back to active" : "Move to Completed"}
              onClick={() => start(async () => { await setArchived(t.id, !t.archived); onRemoved(t.id); })}
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
                start(async () => { await deleteTask(t.id); onRemoved(t.id); });
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
        <div className="px-6 pb-4 pt-5">
          <div className="mb-1 text-[11px] text-muted">{t.code} · added {fmtDate(t.addedOn, true)}</div>
          {seeAll ? (
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
            <Row label="Brand">
              <CellSelect
                value={t.brandId ?? ""}
                disabled={!can("brandId")}
                options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
                onChange={(v) => onUpdate(t.id, { brandId: v || null })}
              />
            </Row>
            <Row label={seeAll ? "Team deadline" : "Deadline"}>
              <input
                type="date"
                disabled={!can("internalDeadline")}
                value={toInputDate(t.internalDeadline)}
                onChange={(e) => onUpdate(t.id, { internalDeadline: e.target.value || null })}
                className="cell-select"
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
        <div className="border-t border-line bg-canvas/50 px-6 pb-6 pt-3">
          <div className="mb-3 flex gap-4 text-[13px]">
            {(["updates", "activity"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("border-b-2 pb-1.5 font-medium capitalize", tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {k === "updates" ? `Updates & links${updates?.length ? ` (${updates.length})` : ""}` : "Activity"}
              </button>
            ))}
          </div>

          {tab === "updates" && (
            <div className="space-y-4">
              {updates === null && <p className="text-[12px] text-muted">Loading…</p>}
              {updates?.length === 0 && <p className="text-[12px] text-muted">No updates yet. Drop progress notes, drive links or render status here.</p>}
              {updates?.map((u) => (
                <div key={u.id} className="flex gap-2.5">
                  <Avatar name={u.authorName} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px]">
                      <span className="font-semibold">{u.authorName}</span>
                      <span className="ml-2 text-muted">{fmtDateTime(u.createdAt)}</span>
                    </div>
                    <RichText text={u.body} />
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
        <div className="border-t border-line px-4 py-3">
          {err && <p className="mb-2 text-[12px] text-rose-600">{err}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
              rows={2}
              placeholder="Post an update or a link…  (Ctrl+Enter)"
              className="field-input flex-1 resize-none"
            />
            <button onClick={post} disabled={pending || !draft.trim()} className="btn-primary h-9">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
