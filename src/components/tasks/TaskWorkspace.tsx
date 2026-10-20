"use client";

import { CalendarDays, Columns3, List, Plus, Search } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createTask, updateTask } from "@/lib/actions";
import { PRIORITIES } from "@/lib/constants";
import type { BrandDTO, PersonDTO, StorageDTO, TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, computeStage, isDone, STAGE_GROUPS, type BoardKey } from "@/lib/status";
import { cn, fromInputDateTime } from "@/lib/utils";
import TaskBoard, { dropPatch } from "./TaskBoard";
import TaskCalendar from "./TaskCalendar";
import TaskList, { type Group } from "./TaskList";
import TaskCards from "./TaskCards";
import TaskPanel from "./TaskPanel";

type View = "list" | "board" | "calendar";
type GroupBy = "board" | "stage" | "brand" | "assignee" | "priority" | "none";

type Props = {
  title: string;
  subtitle?: string;
  accentColor?: string;
  headerExtra?: React.ReactNode;
  tasks: TaskDTO[];
  people: PersonDTO[];
  brands: BrandDTO[];
  storages: StorageDTO[];
  viewer: { id: string; role: string; seeAll: boolean; admin: boolean; department: string; brandIds: string[] };
  mode: "all" | "mine" | "brand" | "archive";
  fixedBrandId?: string;
  defaultGroupBy?: GroupBy;
};

const byDue = (a: TaskDTO, b: TaskDTO) => {
  const x = a.internalDeadline ?? a.externalDeadline;
  const y = b.internalDeadline ?? b.externalDeadline;
  if (!x && !y) return a.code.localeCompare(b.code);
  if (!x) return 1;
  if (!y) return -1;
  return x.localeCompare(y);
};

export default function TaskWorkspace(props: Props) {
  const { viewer, people, brands, mode } = props;
  const pathname = usePathname();
  const search = useSearchParams();

  const [tasks, setTasks] = useState(props.tasks);
  const [storages, setStorages] = useState(props.storages);
  useEffect(() => setStorages(props.storages), [props.storages]);
  useEffect(() => setTasks(props.tasks), [props.tasks]);

  // Saves don't wait for a page rebuild (that's what keeps clicks fast). Once
  // edits settle, quietly re-sync in the background so every page, board and
  // sidebar count shows the latest data.
  const router = useRouter();
  const inflight = useRef(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncSoon = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (inflight.current === 0) router.refresh();
      else syncSoon();
    }, 1500);
  }, [router]);
  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);

  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>(props.defaultGroupBy ?? "board");
  const [q, setQ] = useState("");
  const [brandF, setBrandF] = useState("");
  const [personF, setPersonF] = useState("");
  const [prioF, setPrioF] = useState("");
  const [showDone, setShowDone] = useState(mode === "archive");
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  // Remember view + grouping per page (light per-viewer convenience)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`ws2:${pathname}`) || "{}");
      if (s.view) setView(s.view);
      if (s.groupBy) setGroupBy(s.groupBy);
    } catch {}
  }, [pathname]);
  useEffect(() => {
    try { localStorage.setItem(`ws2:${pathname}`, JSON.stringify({ view, groupBy })); } catch {}
  }, [pathname, view, groupBy]);

  const selectedId = search.get("task");
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const open = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (id) sp.set("task", id);
      else sp.delete("task");
      // Update the URL without a server round-trip so the panel opens instantly
      // (Next keeps useSearchParams in sync with history.replaceState).
      window.history.replaceState(null, "", `${pathname}${sp.toString() ? `?${sp}` : ""}`);
    },
    [pathname, search],
  );

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // Optimistic inline update
  const onUpdate = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const prev = tasks;
      setTasks((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const n: any = { ...t, ...patch };
          if ("assigneeId" in patch) n.assigneeName = people.find((p) => p.id === patch.assigneeId)?.name ?? null;
          if ("brandId" in patch) {
            const b = brands.find((x) => x.id === patch.brandId);
            n.brandName = b?.name ?? null;
            n.brandColor = b?.color ?? null;
          }
          return n;
        }),
      );
      inflight.current++;
      start(async () => {
        try {
          const fresh = await updateTask(id, patch);
          setTasks((ts) => ts.map((t) => (t.id === id ? fresh : t)));
        } catch (e) {
          setTasks(prev);
          flash(e instanceof Error ? e.message : "Couldn't save that change");
        } finally {
          inflight.current--;
          syncSoon();
        }
      });
    },
    [tasks, people, brands, syncSoon],
  );

  // Everything matching the filters (the board always shows Completed)…
  const matching = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => !brandF || t.brandId === brandF)
      .filter((t) => !personF || (personF === "none" ? !t.assigneeId : t.assigneeId === personF))
      .filter((t) => !prioF || t.priority === prioF)
      .filter((t) => !needle || `${t.code} ${t.title} ${t.brandName ?? ""} ${t.assigneeName ?? ""}`.toLowerCase().includes(needle))
      .sort(byDue);
  }, [tasks, q, brandF, personF, prioF]);
  // …and the list / calendar hide finished work unless asked.
  const filtered = useMemo(() => (showDone ? matching : matching.filter((t) => !isDone(t))), [matching, showDone]);

  const groups: Group[] = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", tasks: filtered }];
    if (groupBy === "board")
      return BOARD_COLUMNS.map((c) => ({ key: c.key, label: c.label, color: c.dot, tasks: filtered.filter((t) => boardColumn(t) === c.key) })).filter(
        (g) => g.tasks.length,
      );
    if (groupBy === "stage")
      return STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.dot, tasks: filtered.filter((t) => computeStage(t).key === g.key) })).filter(
        (g) => g.tasks.length,
      );
    if (groupBy === "priority")
      return PRIORITIES.map((p) => ({ key: p, label: p, tasks: filtered.filter((t) => t.priority === p) })).filter((g) => g.tasks.length);
    if (groupBy === "brand") {
      const m = new Map<string, Group>();
      for (const t of filtered) {
        const k = t.brandId ?? "none";
        if (!m.has(k)) m.set(k, { key: k, label: t.brandName ?? "No brand", color: t.brandColor ?? "#a2a0a2", tasks: [] });
        m.get(k)!.tasks.push(t);
      }
      return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    }
    const m = new Map<string, Group>();
    for (const t of filtered) {
      const k = t.assigneeId ?? "none";
      if (!m.has(k)) m.set(k, { key: k, label: t.assigneeName ?? "Unassigned", tasks: [] });
      m.get(k)!.tasks.push(t);
    }
    return [...m.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
  }, [filtered, groupBy]);

  // Quick add
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBrand, setNewBrand] = useState(props.fixedBrandId ?? "");
  const [newPerson, setNewPerson] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newExtDue, setNewExtDue] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newPrio, setNewPrio] = useState("Medium");
  const [newCollabs, setNewCollabs] = useState<string[]>([]);

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    start(async () => {
      try {
        const t = await createTask({
          title: newTitle,
          brandId: newBrand || null,
          assigneeId: newPerson || null,
          internalDeadline: newDue || null,
          externalDeadline: newExtDue || null,
          startAt: fromInputDateTime(newStart),
          endAt: fromInputDateTime(newEnd),
          priority: newPrio,
          collaboratorIds: newCollabs,
        });
        setTasks((ts) => [t, ...ts]);
        syncSoon();
        setNewTitle("");
        setNewCollabs([]);
        setNewStart("");
        setNewEnd("");
        flash(`${t.code} added`);
      } catch (err) {
        flash(err instanceof Error ? err.message : "Couldn't add task");
      }
    });
  }

  // Everyone can add tasks. Team members' tasks are assigned to themselves,
  // except inside a brand workspace they belong to (they can assign anyone).
  const canCreate = mode !== "archive";
  const workspaceBrand = props.fixedBrandId || newBrand;
  const canAssign = viewer.seeAll || (!!workspaceBrand && viewer.brandIds.includes(workspaceBrand));
  const statusField = !viewer.seeAll && viewer.department === "Creative" ? "scriptStage" : "editStatus";

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="border-b border-line px-4 pt-4 md:px-6">
          <div className="flex items-center gap-3">
            {props.accentColor && <span className="h-7 w-7 rounded-md" style={{ background: props.accentColor }} />}
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold tracking-tight md:text-[20px]">{props.title}</h1>
              {props.subtitle && <p className="text-[12px] text-muted">{props.subtitle}</p>}
            </div>
            {props.headerExtra && <div className="ml-auto shrink-0">{props.headerExtra}</div>}
          </div>
          <div data-tour="view-tabs" className="mt-3 flex gap-5 text-[13px]">
            {([
              ["list", List, "List"],
              ["board", Columns3, "Board"],
              ["calendar", CalendarDays, "Calendar"],
            ] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn("flex items-center gap-1.5 border-b-2 pb-2 font-medium", view === v ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </header>

        {/* toolbar */}
        <div data-tour="toolbar" className="scroll-thin flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-2 md:flex-wrap md:overflow-visible md:px-6">
          {canCreate && (
            <button data-tour="add-task" className="btn-primary shrink-0" onClick={() => setAdding((a) => !a)}>
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          )}
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="field-input w-36 py-1 pl-7 md:w-48" />
          </div>
          {!props.fixedBrandId && (
            <select value={brandF} onChange={(e) => setBrandF(e.target.value)} className="field-input w-auto shrink-0 py-1">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {viewer.seeAll && (
            <select value={personF} onChange={(e) => setPersonF(e.target.value)} className="field-input w-auto shrink-0 py-1">
              <option value="">Everyone</option>
              <option value="none">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={prioF} onChange={(e) => setPrioF(e.target.value)} className="field-input w-auto shrink-0 py-1">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          {view === "list" && (
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="field-input w-auto shrink-0 py-1">
              <option value="board">Group: Status</option>
              <option value="stage">Group: Detailed stage</option>
              {!props.fixedBrandId && <option value="brand">Group: Brand</option>}
              {viewer.seeAll && <option value="assignee">Group: Assignee</option>}
              <option value="priority">Group: Priority</option>
              <option value="none">No grouping</option>
            </select>
          )}
          {mode !== "archive" && view !== "board" && (
            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-muted">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[#5b3fd1]" />
              Show delivered & closed
            </label>
          )}
          <span className={cn("shrink-0 whitespace-nowrap text-[12px] text-muted", (mode === "archive" || view === "board") && "ml-auto")}>{(view === "board" ? matching : filtered).length} tasks</span>
        </div>

        {adding && canCreate && (
          <form onSubmit={submitNew} className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-4 py-2.5 md:px-6">
            <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task name" className="field-input min-w-[200px] flex-1" />
            {!props.fixedBrandId && (
              <select value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className="field-input w-auto">
                <option value="">Brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {canAssign && (
              <select value={newPerson} onChange={(e) => setNewPerson(e.target.value)} className="field-input w-auto">
                <option value="">Assignee</option>
                {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select value={newPrio} onChange={(e) => setNewPrio(e.target.value)} className="field-input w-auto">
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[12px] text-muted">
              Start <input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="field-input w-auto" />
            </label>
            <label className="flex items-center gap-1 text-[12px] text-muted">
              End <input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="field-input w-auto" />
            </label>
            <label className="flex items-center gap-1 text-[12px] text-muted">
              Due <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="field-input w-auto" />
            </label>
            {viewer.seeAll && (
              <label className="flex items-center gap-1 text-[12px] text-muted">
                Client <input type="date" value={newExtDue} onChange={(e) => setNewExtDue(e.target.value)} className="field-input w-auto" />
              </label>
            )}
            <select
              value=""
              onChange={(e) => e.target.value && setNewCollabs((c) => [...new Set([...c, e.target.value])])}
              className="field-input w-auto"
            >
              <option value="">+ Collaborator</option>
              {people.filter((p) => p.active && p.id !== viewer.id && !newCollabs.includes(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {newCollabs.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[12px]">
                {people.find((p) => p.id === id)?.name}
                <button type="button" className="text-muted hover:text-ink" onClick={() => setNewCollabs((c) => c.filter((x) => x !== id))}>×</button>
              </span>
            ))}
            {!canAssign && <span className="basis-full text-[11px] text-muted">The task is assigned to you. Collaborators can see it and comment.</span>}
            <button type="submit" className="btn-primary">Add</button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </form>
        )}

        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-10 pt-1 md:px-6">
          {view === "list" && (
            filtered.length === 0 ? (
              <div className="py-20 text-center text-[13px] text-muted">
                {mode === "mine" ? "Nothing on your plate right now. Click \"Add task\" to create one, then click the task to open it (comments are at the bottom)." : "No tasks match these filters."}
              </div>
            ) : (
              <>
              <div className="md:hidden">
                <TaskCards
                  groups={groups}
                  viewer={viewer}
                  statusField={statusField}
                  showAssignee={mode !== "mine"}
                  showBrand={!props.fixedBrandId}
                  selectedId={selectedId}
                  onOpen={(id) => open(id)}
                  onUpdate={onUpdate}
                />
              </div>
              <div className="hidden md:block">
              <TaskList
                groups={groups}
                people={people}
                brands={brands}
                viewer={viewer}
                statusField={statusField}
                showAssignee={mode !== "mine"}
                showBrand={!props.fixedBrandId}
                selectedId={selectedId}
                onOpen={(id) => open(id)}
                onUpdate={onUpdate}
              />
              </div>
              </>
            )
          )}
          {view === "board" && (
            <div className="h-full pt-3">
              <TaskBoard
                tasks={matching}
                selectedId={selectedId}
                showAssignee={mode !== "mine"}
                onOpen={(id) => open(id)}
                onMove={(t, to: BoardKey) => {
                  const patch = dropPatch(t, to);
                  if (patch) onUpdate(t.id, patch);
                }}
              />
            </div>
          )}
          {view === "calendar" && <div className="pt-3"><TaskCalendar tasks={filtered} seeAll={viewer.seeAll} onOpen={(id) => open(id)} /></div>}
        </div>
      </div>

      {selected && (
        <TaskPanel
          key={selected.id}
          task={selected}
          people={people}
          brands={brands}
          storages={storages}
          onStorageCreated={(st) => setStorages((xs) => (xs.some((x) => x.id === st.id) ? xs : [...xs, st].sort((a, b) => a.name.localeCompare(b.name))))}
          viewer={viewer}
          onClose={() => open(null)}
          onReplace={(fresh) => {
            setTasks((ts) => ts.map((t) => (t.id === fresh.id ? fresh : t)));
            syncSoon();
          }}
          onUpdate={onUpdate}
          onRemoved={(id) => {
            setTasks((ts) => ts.filter((t) => t.id !== id));
            open(null);
            syncSoon();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-[13px] text-surface shadow-pop">{toast}</div>
      )}
    </div>
  );
}
