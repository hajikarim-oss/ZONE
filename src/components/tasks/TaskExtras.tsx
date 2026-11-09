"use client";

import { Check, ChevronDown, ExternalLink, FolderOpen, HardDrive, Link2, Paperclip, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import {
  addAttachments, addSubtask, createStorage, deleteAttachment, deleteSubtask, updateSubtask,
  type AttachmentDTO, type SubtaskDTO,
} from "@/lib/actions";
import { driveConfigured, pickFromDrive } from "@/lib/drive-picker";
import type { PersonDTO, StorageDTO } from "@/lib/dto";
import { cn, toInputDate } from "@/lib/utils";

export const PIPELINE_TEMPLATES = [
  {
    name: "Reels / Shorts (5 steps)",
    icon: "🎬",
    tasks: [
      "Footage Ingestion & A-Roll Assembly",
      "B-Roll, Sound FX & Beat Sync",
      "Motion Graphics, Captions & Text Hooks",
      "Color Grading & Audio Mastering",
      "Final Export & Verification Check",
    ],
  },
  {
    name: "YouTube Long-Form (5 steps)",
    icon: "📹",
    tasks: [
      "Footage Sorting & Audio Cleanup",
      "Story Assembly & Rough Cut",
      "Pacing, Visual Hooks & B-Roll",
      "Sound Design & Motion Lower-Thirds",
      "Thumbnail Draft & Master Export",
    ],
  },
  {
    name: "Ad Creative Variations (4 steps)",
    icon: "⚡",
    tasks: [
      "Hook 1, 2, 3 Variation Cuts",
      "Core Pitch & Problem-Solution Narrative",
      "Offer & Call-To-Action Graphics",
      "Aspect Ratio Exports (9:16 & 1:1)",
    ],
  },
  {
    name: "Client Feedback Fixes (3 steps)",
    icon: "🔄",
    tasks: [
      "Implement Client Feedback & Trims",
      "Color & Audio Corrections",
      "Final Review Version Export",
    ],
  },
];

const sectionTitle = "mb-1.5 mt-6 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted";

// ---------------- Subtasks (Asana-style) ----------------
export function Subtasks({
  projectId,
  items,
  setItems,
  people,
  canEdit,
  onError,
}: {
  projectId: string;
  items: SubtaskDTO[] | null;
  setItems: (fn: (x: SubtaskDTO[]) => SubtaskDTO[]) => void;
  people: PersonDTO[];
  canEdit: boolean;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const list = items ?? [];
  const done = list.filter((s) => s.done).length;
  const active = people.filter((p) => p.active);

  function patch(id: string, p: Partial<SubtaskDTO>) {
    if (id.startsWith("tmp-")) return;
    const prev = list.find((x) => x.id === id);
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    updateSubtask(id, p)
      .then((fresh) => setItems((xs) => xs.map((x) => (x.id === id ? fresh : x))))
      .catch((e) => {
        if (prev) setItems((xs) => xs.map((x) => (x.id === id ? prev : x)));
        onError(e instanceof Error ? e.message : "Couldn't save subtask");
      });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const tmp: SubtaskDTO = { id: `tmp-${Date.now()}`, title: t, assigneeId: assignee || null, dueDate: due || null, done: false };
    setItems((xs) => [...xs, tmp]);
    setTitle("");
    addSubtask(projectId, { title: t, assigneeId: assignee || null, dueDate: due || null })
      .then((s) => setItems((xs) => xs.map((x) => (x.id === tmp.id ? s : x))))
      .catch((err) => {
        setItems((xs) => xs.filter((x) => x.id !== tmp.id));
        onError(err instanceof Error ? err.message : "Couldn't add subtask");
      });
  }

  async function applyTemplate(tplTasks: string[]) {
    setTemplatesOpen(false);
    setApplying(true);
    try {
      for (const t of tplTasks) {
        const tmp: SubtaskDTO = { id: `tmp-${Date.now()}-${Math.random()}`, title: t, assigneeId: null, dueDate: null, done: false };
        setItems((xs) => [...xs, tmp]);
        const saved = await addSubtask(projectId, { title: t, assigneeId: null, dueDate: null });
        setItems((xs) => xs.map((x) => (x.id === tmp.id ? saved : x)));
      }
    } catch (e) {
      onError("Couldn't add all template steps");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="mb-1.5 mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Child Issues / Subtasks
          </span>
          {list.length > 0 && (
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full">
              {done}/{list.length} done
            </span>
          )}
        </div>

        {canEdit && (
          <div className="relative">
            <button
              type="button"
              disabled={applying}
              onClick={() => setTemplatesOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 h-6 px-2 text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors cursor-pointer"
            >
              <Sparkles className="size-3" />
              <span>{applying ? "Adding steps..." : "Apply Template"}</span>
              <ChevronDown className="size-3" />
            </button>

            {templatesOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-xl border border-stone-200 bg-white p-1.5 shadow-pop z-30 dark:border-[#2C3B53] dark:bg-[#161B22]">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Select Pipeline Preset
                </div>
                <div className="space-y-0.5">
                  {PIPELINE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => applyTemplate(tpl.tasks)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span className="text-sm">{tpl.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {tpl.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {tpl.tasks.length} standard milestone steps
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {list.length > 0 && (
        <div className="mb-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${Math.round((done / list.length) * 100)}%` }}
          />
        </div>
      )}

      {items === null && <p className="text-[12px] text-muted">Loading…</p>}
      <div className="divide-y divide-line/70 rounded-md border border-line">
        {list.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 px-2 py-1.5">
            <button
              onClick={() => patch(s.id, { done: !s.done })}
              disabled={s.id.startsWith("tmp-")}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted/50 hover:border-emerald-500",
              )}
              title={s.done ? "Mark not done" : "Mark done"}
            >
              {s.done && <Check className="h-3 w-3" />}
            </button>
            <input
              defaultValue={s.title}
              key={s.title}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.title && patch(s.id, { title: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className={cn("min-w-0 flex-1 bg-transparent text-[13px] outline-none", s.done && "text-muted line-through")}
            />
            <select
              value={s.assigneeId ?? ""}
              onChange={(e) => patch(s.id, { assigneeId: e.target.value || null })}
              className="w-28 shrink-0 truncate bg-transparent text-[12px] text-muted outline-none hover:text-ink"
              title="Assignee"
            >
              <option value="">Unassigned</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={toInputDate(s.dueDate)}
              onChange={(e) => patch(s.id, { dueDate: e.target.value || null })}
              className="w-[118px] shrink-0 bg-transparent text-[12px] text-muted outline-none hover:text-ink"
              title="Due date"
            />
            <button
              onClick={() => {
                setItems((xs) => xs.filter((x) => x.id !== s.id));
                deleteSubtask(s.id).catch(() => {
                  setItems((xs) => [...xs, s]);
                  onError("Couldn't delete subtask");
                });
              }}
              className="shrink-0 text-muted opacity-0 hover:text-rose-600 group-hover:opacity-100"
              title="Delete subtask"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {canEdit && (
          <form onSubmit={add} className="flex items-center gap-2 px-2 py-1.5">
            <Plus className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a subtask… (Enter to add)"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/70"
            />
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-28 shrink-0 bg-transparent text-[12px] text-muted outline-none">
              <option value="">Assignee</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-[118px] shrink-0 bg-transparent text-[12px] text-muted outline-none" />
          </form>
        )}
      </div>
      {list.some((s) => s.assigneeId) && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-muted">
          {[...new Set(list.filter((s) => s.assigneeId && !s.done).map((s) => s.assigneeId!))].map((id) => {
            const p = people.find((x) => x.id === id);
            return p ? (
              <span key={id} className="inline-flex items-center gap-1">
                <Avatar name={p.name} size={14} /> {p.name.split(" ")[0]}
              </span>
            ) : null;
          })}
          <span>have open subtasks (it shows in their My tasks)</span>
        </div>
      )}
    </>
  );
}

// ---------------- Attachments (Google Drive / links) ----------------
export function Attachments({
  projectId,
  items,
  setItems,
  onError,
}: {
  projectId: string;
  items: AttachmentDTO[] | null;
  setItems: (fn: (x: AttachmentDTO[]) => AttachmentDTO[]) => void;
  onError: (msg: string) => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = items ?? [];

  async function save(files: { name: string; url: string; mimeType?: string | null; iconUrl?: string | null }[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const rows = await addAttachments(projectId, files);
      setItems((xs) => [...xs, ...rows]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't attach");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className={sectionTitle}>
        Attachments
        {list.length > 0 && <span className="font-normal normal-case tracking-normal">{list.length}</span>}
      </h3>
      {list.length > 0 && (
        <div className="mb-2 grid gap-1.5 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="group flex items-center gap-2 rounded-md border border-line px-2.5 py-2">
              {a.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.iconUrl} alt="" className="h-4 w-4 shrink-0" />
              ) : a.mimeType?.includes("folder") ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-muted" />
              ) : (
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
              )}
              <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:text-accent hover:underline" title={a.name}>
                {a.name}
              </a>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
              <button
                onClick={() => {
                  setItems((xs) => xs.filter((x) => x.id !== a.id));
                  deleteAttachment(a.id).catch(() => {
                    setItems((xs) => [...xs, a]);
                    onError("Couldn't remove attachment");
                  });
                }}
                className="shrink-0 text-muted opacity-0 hover:text-rose-600 group-hover:opacity-100"
                title={`Remove (added by ${a.addedByName})`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost border border-line text-[12px]"
          disabled={busy}
          onClick={async () => {
            try {
              await save(await pickFromDrive());
            } catch (e) {
              onError(e instanceof Error ? e.message : "Couldn't open Google Drive");
            }
          }}
          title={driveConfigured ? "Pick files or folders from Google Drive" : "Google Drive isn't set up yet; paste a link instead"}
        >
          <HardDrive className="h-3.5 w-3.5" /> Google Drive
        </button>
        <button className="btn-ghost border border-line text-[12px]" onClick={() => setPasting((x) => !x)}>
          <Paperclip className="h-3.5 w-3.5" /> Paste a link
        </button>
      </div>
      {pasting && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            await save([{ name: name.trim() || url.trim(), url }]);
            setUrl("");
            setName("");
            setPasting(false);
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…  (or WeTransfer, Frame.io…)" className="field-input flex-1" autoFocus />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="field-input sm:w-40" />
          <button className="btn-primary" disabled={busy || !url.trim()}>Attach</button>
        </form>
      )}
    </>
  );
}

// ---------------- Storage name dropdown (+ add new) ----------------
export function StoragePicker({
  value,
  storages,
  disabled,
  onChange,
  onCreated,
  onError,
}: {
  value: string | null;
  storages: StorageDTO[];
  disabled?: boolean;
  onChange: (id: string | null) => void;
  onCreated: (s: StorageDTO) => void;
  onError: (msg: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (adding)
    return (
      <form
        className="flex items-center gap-1.5 px-1"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const s = await createStorage(name);
            onCreated(s);
            onChange(s.id);
            setName("");
            setAdding(false);
          } catch (err) {
            onError(err instanceof Error ? err.message : "Couldn't add storage");
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drive 4TB #2 / NAS → Brands" className="field-input flex-1 py-1" autoFocus />
        <button className="btn-primary h-8 px-2.5 text-[12px]" disabled={!name.trim()}>Add</button>
        <button type="button" className="btn-ghost h-8 px-2" onClick={() => setAdding(false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
    );
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === "__new") setAdding(true);
        else onChange(e.target.value || null);
      }}
      className="cell-select truncate"
    >
      <option value="">— Not set —</option>
      {storages.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
      <option value="__new">+ Add new storage…</option>
    </select>
  );
}
