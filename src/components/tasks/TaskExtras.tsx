"use client";

import {
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Link2,
  Maximize2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import {
  addAttachments,
  addSubtask,
  createStorage,
  deleteAttachment,
  deleteSubtask,
  updateSubtask,
  type AttachmentDTO,
  type SubtaskDTO,
} from "@/lib/actions";
import { driveConfigured, pickFromDrive } from "@/lib/drive-picker";
import type { PersonDTO, StorageDTO } from "@/lib/dto";
import { cn, toInputDate } from "@/lib/utils";
import storageDataJson from "@/data/storage-management.json";

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

export type SubtaskExtraFields = {
  description?: string;
  reporter?: string;
  campaign?: string;
  priority?: string;
};

const sectionTitle = "mb-1.5 mt-6 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted";

// ---------------- Subtasks (Point 4: Templates + Custom Subtasks + Expandable Full Task Sheet) ----------------
export function Subtasks({
  projectId,
  items,
  setItems,
  people,
  canEdit,
  onError,
  defaultReporter,
  defaultCampaign,
  campaigns = [],
}: {
  projectId: string;
  items: SubtaskDTO[] | null;
  setItems: (fn: (x: SubtaskDTO[]) => SubtaskDTO[]) => void;
  people: PersonDTO[];
  canEdit: boolean;
  onError: (msg: string) => void;
  defaultReporter?: string | null;
  defaultCampaign?: string | null;
  campaigns?: { id: string; name: string }[];
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  // Extended subtask metadata (description, reporter, campaign)
  const [extrasMap, setExtrasMap] = useState<Record<string, SubtaskExtraFields>>({});
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  // Custom subtask form states
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customAssignee, setCustomAssignee] = useState("");
  const [customDue, setCustomDue] = useState("");
  const [customReporter, setCustomReporter] = useState(defaultReporter || "Admin");
  const [customCampaign, setCustomCampaign] = useState(defaultCampaign || "");
  const [savingCustom, setSavingCustom] = useState(false);

  const list = items ?? [];
  const done = list.filter((s) => s.done).length;
  const active = people.filter((p) => p.active);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/meta?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.subtaskExtras) {
          setExtrasMap(data.subtaskExtras);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function saveExtra(subtaskId: string, patchExtra: Partial<SubtaskExtraFields>) {
    const merged: SubtaskExtraFields = {
      ...(extrasMap[subtaskId] || {}),
      ...patchExtra,
    };
    setExtrasMap((prev) => ({ ...prev, [subtaskId]: merged }));
    try {
      await fetch("/api/portal/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSubtaskExtra",
          subtaskId,
          extra: merged,
        }),
      });
    } catch {
      // ignore transient error
    }
  }

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
    const tmp: SubtaskDTO = {
      id: `tmp-${Date.now()}`,
      title: t,
      assigneeId: assignee || null,
      dueDate: due || null,
      done: false,
    };
    setItems((xs) => [...xs, tmp]);
    setTitle("");
    addSubtask(projectId, { title: t, assigneeId: assignee || null, dueDate: due || null })
      .then((s) => {
        setItems((xs) => xs.map((x) => (x.id === tmp.id ? s : x)));
        if (defaultReporter || defaultCampaign) {
          saveExtra(s.id, {
            reporter: defaultReporter || "Admin",
            campaign: defaultCampaign || "",
          });
        }
      })
      .catch((err) => {
        setItems((xs) => xs.filter((x) => x.id !== tmp.id));
        onError(err instanceof Error ? err.message : "Couldn't add subtask");
      });
  }

  async function handleCreateCustomSubtask(e: React.FormEvent) {
    e.preventDefault();
    const t = customTitle.trim();
    if (!t) return;
    setSavingCustom(true);
    try {
      const saved = await addSubtask(projectId, {
        title: t,
        assigneeId: customAssignee || null,
        dueDate: customDue || null,
      });
      setItems((xs) => [...xs, saved]);
      await saveExtra(saved.id, {
        description: customDesc.trim(),
        reporter: customReporter.trim() || defaultReporter || "Admin",
        campaign: customCampaign.trim() || defaultCampaign || "",
      });
      setCustomTitle("");
      setCustomDesc("");
      setCustomAssignee("");
      setCustomDue("");
      setCustomModalOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't create custom subtask");
    } finally {
      setSavingCustom(false);
    }
  }

  async function applyTemplate(tplTasks: string[]) {
    setTemplatesOpen(false);
    setApplying(true);
    try {
      for (const t of tplTasks) {
        const tmp: SubtaskDTO = {
          id: `tmp-${Date.now()}-${Math.random()}`,
          title: t,
          assigneeId: null,
          dueDate: null,
          done: false,
        };
        setItems((xs) => [...xs, tmp]);
        const saved = await addSubtask(projectId, { title: t, assigneeId: null, dueDate: null });
        setItems((xs) => xs.map((x) => (x.id === tmp.id ? saved : x)));
      }
    } catch {
      onError("Couldn't add all template steps");
    } finally {
      setApplying(false);
    }
  }

  const expandedSubtask = list.find((s) => s.id === expandedSubtaskId) || null;
  const expandedExtra = expandedSubtask ? extrasMap[expandedSubtask.id] || {} : {};

  return (
    <>
      <div className="mb-1.5 mt-5 flex items-center justify-between flex-wrap gap-2">
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCustomReporter(defaultReporter || "Admin");
                setCustomCampaign(defaultCampaign || "");
                setCustomModalOpen(true);
              }}
              className="inline-flex items-center gap-1 h-6 px-2.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800/60 rounded transition-colors cursor-pointer"
            >
              <Plus className="size-3" />
              <span>Custom Subtask</span>
            </button>

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
      <div className="divide-y divide-line/70 rounded-md border border-line bg-surface">
        {list.map((s) => {
          const ex = extrasMap[s.id] || {};
          const assigneePerson = people.find((p) => p.id === s.assigneeId);
          return (
            <div
              key={s.id}
              className="group flex items-center gap-2 px-2.5 py-2 hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors"
            >
              <button
                type="button"
                onClick={() => patch(s.id, { done: !s.done })}
                disabled={s.id.startsWith("tmp-")}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border cursor-pointer",
                  s.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-muted/50 hover:border-emerald-500"
                )}
                title={s.done ? "Mark not done" : "Mark done"}
              >
                {s.done && <Check className="h-3 w-3" />}
              </button>

              {/* Short form row inside parent task — clicking opens full subtask sheet */}
              <button
                type="button"
                onClick={() => !s.id.startsWith("tmp-") && setExpandedSubtaskId(s.id)}
                className="min-w-0 flex-1 text-left flex items-center gap-2 cursor-pointer group/title"
                title="Click to expand and open full subtask sheet"
              >
                <span
                  className={cn(
                    "truncate text-[13px] font-medium group-hover/title:text-[#0052CC] transition-colors",
                    s.done && "text-muted line-through"
                  )}
                >
                  {s.title}
                </span>
                {ex.campaign && (
                  <span className="shrink-0 rounded bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                    {ex.campaign}
                  </span>
                )}
                {ex.description && (
                  <span className="shrink-0 text-slate-400" title={ex.description}>
                    <FileText className="h-3 w-3" />
                  </span>
                )}
              </button>

              {ex.reporter && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-muted shrink-0"
                  title={`Reporter: ${ex.reporter}`}
                >
                  <User className="h-2.5 w-2.5" />
                  {ex.reporter.split(" ")[0]}
                </span>
              )}

              <select
                value={s.assigneeId ?? ""}
                onChange={(e) => patch(s.id, { assigneeId: e.target.value || null })}
                className="w-28 shrink-0 truncate bg-transparent text-[12px] text-muted outline-none hover:text-ink"
                title="Assignee"
              >
                <option value="">Unassigned</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={toInputDate(s.dueDate)}
                onChange={(e) => patch(s.id, { dueDate: e.target.value || null })}
                className="w-[114px] shrink-0 bg-transparent text-[11.5px] text-muted outline-none hover:text-ink"
                title="Due date"
              />

              <button
                type="button"
                onClick={() => !s.id.startsWith("tmp-") && setExpandedSubtaskId(s.id)}
                className="shrink-0 p-1 rounded text-slate-400 hover:text-[#0052CC] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                title="Open full subtask sheet"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setItems((xs) => xs.filter((x) => x.id !== s.id));
                  deleteSubtask(s.id).catch(() => {
                    setItems((xs) => [...xs, s]);
                    onError("Couldn't delete subtask");
                  });
                }}
                className="shrink-0 text-muted opacity-0 hover:text-rose-600 group-hover:opacity-100 cursor-pointer"
                title="Delete subtask"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {canEdit && (
          <form onSubmit={add} className="flex items-center gap-2 px-2.5 py-1.5 bg-canvas/30">
            <Plus className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quick add subtask… (or click 'Custom Subtask' for full fields)"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/70"
            />
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-28 shrink-0 bg-transparent text-[12px] text-muted outline-none"
            >
              <option value="">Assignee</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-[114px] shrink-0 bg-transparent text-[12px] text-muted outline-none"
            />
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
          <span>have open subtasks (click any subtask row to open its full sheet)</span>
        </div>
      )}

      {/* Create Custom Subtask Modal (with full fields: title, description, assignee, date, reporter, campaign) */}
      {customModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setCustomModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Create Custom Subtask</h3>
                <p className="text-[11.5px] text-muted">
                  Full subtask specification with title, description, assignee, due date, reporter & campaign
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                className="p-1 rounded-md text-muted hover:text-ink hover:bg-canvas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomSubtask} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Subtask Title *
                </label>
                <input
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Dynamic Text Hooks & Hinglish Captions Pass"
                  className="field-input w-full text-[13px]"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Description / Creative Brief
                </label>
                <textarea
                  rows={3}
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Add detailed instructions, reference timecodes, or deliverables..."
                  className="field-input w-full text-[13px] py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Assignee
                  </label>
                  <select
                    value={customAssignee}
                    onChange={(e) => setCustomAssignee(e.target.value)}
                    className="field-input w-full text-[13px]"
                  >
                    <option value="">Unassigned</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={customDue}
                    onChange={(e) => setCustomDue(e.target.value)}
                    className="field-input w-full text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Reporter
                  </label>
                  <select
                    value={customReporter}
                    onChange={(e) => setCustomReporter(e.target.value)}
                    className="field-input w-full text-[13px]"
                  >
                    <option value="Admin">Admin</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Campaign
                  </label>
                  <input
                    value={customCampaign}
                    onChange={(e) => setCustomCampaign(e.target.value)}
                    list="subtask-campaigns-list"
                    placeholder="e.g. Diwali Launch / Brand Reel"
                    className="field-input w-full text-[13px]"
                  />
                  <datalist id="subtask-campaigns-list">
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="btn-ghost text-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustom || !customTitle.trim()}
                  className="btn-primary text-[12px] px-4"
                >
                  {savingCustom ? "Creating..." : "Create Subtask"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expandable Full Subtask Sheet Modal (Point 4: Clicking a subtask expands it and opens the full task sheet) */}
      {expandedSubtask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setExpandedSubtaskId(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => patch(expandedSubtask.id, { done: !expandedSubtask.done })}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border cursor-pointer",
                    expandedSubtask.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-muted hover:border-emerald-500"
                  )}
                >
                  {expandedSubtask.done && <Check className="h-3.5 w-3.5" />}
                </button>
                <div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#0052CC]">
                    Full Subtask Sheet
                  </span>
                  <h3 className="text-[16px] font-bold text-ink">{expandedSubtask.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedSubtaskId(null)}
                className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-canvas cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Title
                </label>
                <input
                  defaultValue={expandedSubtask.title}
                  key={expandedSubtask.id + "-title"}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== expandedSubtask.title) {
                      patch(expandedSubtask.id, { title: v });
                    }
                  }}
                  className="field-input w-full text-[13.5px] font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                  Description
                </label>
                <textarea
                  rows={4}
                  defaultValue={expandedExtra.description || ""}
                  key={expandedSubtask.id + "-desc"}
                  onBlur={(e) => saveExtra(expandedSubtask.id, { description: e.target.value })}
                  placeholder="Add subtask description, creative notes, or review checklist..."
                  className="field-input w-full text-[13px] py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Assignee
                  </label>
                  <select
                    value={expandedSubtask.assigneeId ?? ""}
                    onChange={(e) => patch(expandedSubtask.id, { assigneeId: e.target.value || null })}
                    className="field-input w-full text-[13px]"
                  >
                    <option value="">Unassigned</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={toInputDate(expandedSubtask.dueDate)}
                    onChange={(e) => patch(expandedSubtask.id, { dueDate: e.target.value || null })}
                    className="field-input w-full text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Reporter
                  </label>
                  <select
                    value={expandedExtra.reporter || defaultReporter || "Admin"}
                    onChange={(e) => saveExtra(expandedSubtask.id, { reporter: e.target.value })}
                    className="field-input w-full text-[13px]"
                  >
                    <option value="Admin">Admin</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Campaign
                  </label>
                  <input
                    defaultValue={expandedExtra.campaign ?? defaultCampaign ?? ""}
                    key={expandedSubtask.id + "-campaign"}
                    onBlur={(e) => saveExtra(expandedSubtask.id, { campaign: e.target.value.trim() })}
                    placeholder="Campaign name..."
                    className="field-input w-full text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  const idToDel = expandedSubtask.id;
                  setExpandedSubtaskId(null);
                  setItems((xs) => xs.filter((x) => x.id !== idToDel));
                  deleteSubtask(idToDel).catch(() => {
                    setItems((xs) => [...xs, expandedSubtask]);
                    onError("Couldn't delete subtask");
                  });
                }}
                className="text-[12px] font-semibold text-rose-600 hover:underline cursor-pointer"
              >
                Delete Subtask
              </button>
              <button
                type="button"
                onClick={() => setExpandedSubtaskId(null)}
                className="btn-primary text-[12px] px-4 cursor-pointer"
              >
                Done & Save
              </button>
            </div>
          </div>
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
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] hover:text-accent hover:underline"
                title={a.name}
              >
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
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/…  (or WeTransfer, Frame.io…)"
            className="field-input flex-1"
            autoFocus
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="field-input sm:w-40"
          />
          <button className="btn-primary" disabled={busy || !url.trim()}>
            Attach
          </button>
        </form>
      )}
    </>
  );
}

// ---------------- Storage name dropdown + Hard Drive Contents Explorer & Sheet Importer (Point 1) ----------------
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
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerTab, setExplorerTab] = useState<"browse" | "import">("browse");
  const [driveSearch, setDriveSearch] = useState("");
  const [selectedDriveFilter, setSelectedDriveFilter] = useState<string>("ALL");

  // Sheet import states
  const [sheetUrl, setSheetUrl] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [items] = useState(storageDataJson);

  const selectedStorage = storages.find((s) => s.id === value) || null;

  const driveSummaryMap = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const d = item.storageName || "Unassigned";
      const arr = map.get(d) || [];
      arr.push(item);
      map.set(d, arr);
    }
    return map;
  }, [items]);

  const currentDriveAssets = selectedStorage ? driveSummaryMap.get(selectedStorage.name) || [] : [];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedDriveFilter !== "ALL" && item.storageName !== selectedDriveFilter) return false;
      if (!driveSearch.trim()) return true;
      const q = driveSearch.toLowerCase();
      return (
        (item.storageName || "").toLowerCase().includes(q) ||
        (item.task || "").toLowerCase().includes(q) ||
        (item.dataLocation || "").toLowerCase().includes(q) ||
        (item.progress || "").toLowerCase().includes(q) ||
        (item.reviewer || "").toLowerCase().includes(q)
      );
    });
  }, [items, selectedDriveFilter, driveSearch]);

  async function handlePickDriveByName(driveName: string) {
    const existing = storages.find((s) => s.name.toLowerCase() === driveName.toLowerCase());
    if (existing) {
      onChange(existing.id);
      setExplorerOpen(false);
      return;
    }
    try {
      const created = await createStorage(driveName);
      onCreated(created);
      onChange(created.id);
      setExplorerOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't select drive");
    }
  }

  async function handleImportSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim() && !csvText.trim()) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const res = await fetch("/api/portal/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "importStorageCsv",
          sheetUrl: sheetUrl.trim() || undefined,
          csvText: csvText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      if (Array.isArray(data.storages)) {
        for (const st of data.storages) {
          if (!storages.some((x) => x.id === st.id)) {
            onCreated(st);
          }
        }
      }
      setImportStatus(`Synced ${data.importedCount} folder/asset records across ${data.drives?.length || 0} master hard drives.`);
      setSheetUrl("");
      setCsvText("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to import storage sheet");
    } finally {
      setImporting(false);
    }
  }

  if (adding) {
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
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. TBM-HD-01 / 4TB SSD"
          className="field-input flex-1 py-1"
          autoFocus
        />
        <button className="btn-primary h-8 px-2.5 text-[12px]" disabled={!name.trim()}>
          Add
        </button>
        <button type="button" className="btn-ghost h-8 px-2" onClick={() => setAdding(false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "__new") setAdding(true);
            else onChange(e.target.value || null);
          }}
          className="cell-select truncate flex-1"
        >
          <option value="">— Select Hard Drive —</option>
          {storages.map((s) => {
            const count = driveSummaryMap.get(s.name)?.length ?? 0;
            return (
              <option key={s.id} value={s.id}>
                {s.name} {count > 0 ? `(${count} projects)` : ""}
              </option>
            );
          })}
          <option value="__new">+ Add new master drive…</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setSelectedDriveFilter(selectedStorage?.name || "ALL");
            setExplorerOpen(true);
          }}
          className="shrink-0 inline-flex items-center gap-1 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition cursor-pointer"
          title="View all hard drives, inspect folders/assets on each drive, or sync from Google Sheets"
        >
          <HardDrive className="h-3 w-3" />
          <span>Browse Drives</span>
        </button>
      </div>

      {selectedStorage && currentDriveAssets.length > 0 && (
        <div className="rounded border border-line/80 bg-canvas/50 px-2 py-1 text-[11px] text-muted flex items-center justify-between">
          <span className="truncate">
            <strong className="text-ink">{selectedStorage.name}</strong> holds{" "}
            <strong className="text-ink">{currentDriveAssets.length}</strong> indexed folders/assets
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedDriveFilter(selectedStorage.name);
              setExplorerOpen(true);
            }}
            className="text-[#0052CC] font-semibold hover:underline ml-2 shrink-0 cursor-pointer"
          >
            View contents
          </button>
        </div>
      )}

      {/* Hard Drive Contents Explorer & Legacy Sheet Importer Modal */}
      {explorerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setExplorerOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border border-line bg-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-canvas/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-ink">
                    Master Hard Drive Directory & Sheet Sync
                  </h3>
                  <p className="text-[11.5px] text-muted">
                    Single source of truth from Storage Management Sheet — inspect drive folders & pick drive for this project
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setExplorerTab("browse")}
                    className={cn(
                      "px-3 py-1 rounded-md font-semibold transition cursor-pointer",
                      explorerTab === "browse" ? "bg-surface text-ink shadow-2xs" : "text-muted hover:text-ink"
                    )}
                  >
                    Hard Drives & Contents ({items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExplorerTab("import")}
                    className={cn(
                      "px-3 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer",
                      explorerTab === "import" ? "bg-surface text-ink shadow-2xs" : "text-muted hover:text-ink"
                    )}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Import Google Sheet / CSV
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setExplorerOpen(false)}
                  className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-canvas cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {explorerTab === "browse" ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Master Hard Drive Cards (1-click select) */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                    Master Hard Drive List (Click &apos;Use Drive&apos; to assign to this project)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {Array.from(driveSummaryMap.entries()).map(([driveName, driveItems]) => {
                      const isSelected = selectedStorage?.name === driveName;
                      const isFiltered = selectedDriveFilter === driveName;
                      return (
                        <div
                          key={driveName}
                          onClick={() => setSelectedDriveFilter(isFiltered ? "ALL" : driveName)}
                          className={cn(
                            "rounded-lg border p-2.5 transition cursor-pointer flex flex-col justify-between gap-2",
                            isFiltered
                              ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                              : "border-line bg-canvas/40 hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold text-ink">
                              <HardDrive className="h-3.5 w-3.5 text-blue-600" />
                              {driveName}
                            </span>
                            <span className="rounded-full bg-slate-200/70 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted">
                              {driveItems.length} folders
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-line/60">
                            <span className="text-[10.5px] text-muted truncate">
                              {[...new Set(driveItems.map((i) => i.task).filter(Boolean))].slice(0, 2).join(", ")}
                            </span>
                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePickDriveByName(driveName);
                                }}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10.5px] font-bold transition cursor-pointer",
                                  isSelected
                                    ? "bg-emerald-600 text-white"
                                    : "bg-[#0052CC] text-white hover:bg-[#0047B3]"
                                )}
                              >
                                {isSelected ? "Selected ✓" : "Use Drive"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Search & Filter Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="h-3.5 w-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                      placeholder="Search folders, projects, paths, or assets across drives..."
                      className="field-input w-full pl-8 text-[12.5px]"
                    />
                  </div>
                  {selectedDriveFilter !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedDriveFilter("ALL")}
                      className="text-[12px] font-semibold text-[#0052CC] hover:underline cursor-pointer"
                    >
                      Showing {selectedDriveFilter} · Show All Drives
                    </button>
                  )}
                </div>

                {/* Folder & Asset Contents Table */}
                <div className="rounded-lg border border-line overflow-hidden">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas text-[10.5px] font-bold uppercase tracking-wider text-muted">
                        <th className="py-2 px-3">Hard Drive</th>
                        <th className="py-2 px-3">Project / Task Name</th>
                        <th className="py-2 px-3">Folder & Asset Path</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Reviewer</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="hover:bg-canvas/50">
                          <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            {item.storageName}
                          </td>
                          <td className="py-2 px-3 font-semibold text-ink">
                            {item.task}
                          </td>
                          <td className="py-2 px-3 text-muted font-mono text-[11px]">
                            {item.dataLocation || "—"}
                          </td>
                          <td className="py-2 px-3 text-muted whitespace-nowrap">
                            {item.progress || "—"}
                          </td>
                          <td className="py-2 px-3 text-muted whitespace-nowrap">
                            {item.reviewer || "—"}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {!disabled && (
                              <button
                                type="button"
                                onClick={() => handlePickDriveByName(item.storageName)}
                                className="text-[11px] font-bold text-[#0052CC] hover:underline cursor-pointer"
                              >
                                Pick {item.storageName}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <form onSubmit={handleImportSheet} className="p-6 space-y-4 overflow-y-auto">
                <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 p-3.5 text-[12.5px] text-slate-700 dark:text-slate-300 space-y-1">
                  <div className="font-bold text-ink">
                    Legacy Data Import — Google Sheets / CSV Storage Management
                  </div>
                  <p>
                    Import your Google Sheet or CSV recording which folders and assets are on which hard drive.
                    All discovered hard drive names are automatically saved into the master hard drive list.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Option 1: Published Google Sheets URL (or Share Link)
                  </label>
                  <input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="field-input w-full text-[13px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Option 2: Paste CSV Rows Directly (from Google Sheets / Excel)
                  </label>
                  <textarea
                    rows={6}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="1,TBM-HD-01,25/09/2025,Ferrari,Showroom Walkaround,A-Roll & Final Master,Reel,2,Shubham"
                    className="field-input w-full font-mono text-[12px] py-2"
                  />
                </div>

                {importStatus && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-800 dark:text-emerald-300">
                    ✓ {importStatus}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setExplorerTab("browse")}
                    className="btn-ghost text-[12px]"
                  >
                    Back to Drives
                  </button>
                  <button
                    type="submit"
                    disabled={importing || (!sheetUrl.trim() && !csvText.trim())}
                    className="btn-primary text-[12px] px-4"
                  >
                    {importing ? "Syncing Master Drives..." : "Import & Sync Master Drive List"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
