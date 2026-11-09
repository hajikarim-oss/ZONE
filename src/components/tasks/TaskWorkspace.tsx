"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { Page, PageTopbar, StatStrip, Stat, SectionBar, TopbarAction, PageBody } from "@/components/layout/Page";
import { BarChart3, CalendarDays, CheckCircle2, CheckSquare, Columns3, FileText, FolderGit2, HardDrive, List, Maximize2, Plus, Rows3, Search, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createTask, updateTask } from "@/lib/actions";
import { PLATFORMS, PRIORITIES, TYPES, WORK_TYPES } from "@/lib/constants";
import type { BrandDTO, PersonDTO, StorageDTO, TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, computeStage, isDone, STAGE_GROUPS, type BoardKey } from "@/lib/status";
import { cn, fromInputDateTime } from "@/lib/utils";
import TaskBoard, { dropPatch } from "./TaskBoard";
import TaskCalendar from "./TaskCalendar";
import TaskList, { type Group } from "./TaskList";
import TaskCards from "./TaskCards";
import TaskPanel from "./TaskPanel";
import CreateCampaignModal from "@/components/brands/CreateCampaignModal";
import CreateIssueModal from "@/components/jira/CreateIssueModal";
import ProjectDashboardView from "@/components/analytics/ProjectDashboardView";

type View = "list" | "board" | "calendar" | "dashboard";
type GroupBy = "board" | "stage" | "campaign" | "brand" | "assignee" | "priority" | "none";

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
  showDoneDefault?: boolean;
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
  const { viewer, people, mode } = props;
  const [brands, setBrands] = useState(props.brands);
  useEffect(() => setBrands(props.brands), [props.brands]);
  const [createCampaignModalOpen, setCreateCampaignModalOpen] = useState(false);
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
  const [campaignF, setCampaignF] = useState(search.get("campaign") ?? "");
  const [personF, setPersonF] = useState("");
  const [prioF, setPrioF] = useState("");
  const [showDone, setShowDone] = useState(mode === "archive" || !!props.showDoneDefault);
  const activeFilters = [brandF, campaignF, personF, prioF, q.trim()].filter(Boolean).length;
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
      .filter((t) => !campaignF || t.campaignId === campaignF)
      .filter((t) => !personF || (personF === "none" ? !t.assigneeId : t.assigneeId === personF))
      .filter((t) => !prioF || t.priority === prioF)
      .filter((t) => !needle || `${t.code} ${t.title} ${t.brandName ?? ""} ${t.campaignName ?? ""} ${t.assigneeName ?? ""}`.toLowerCase().includes(needle))
      .sort(byDue);
  }, [tasks, q, brandF, campaignF, personF, prioF]);
  // …and the list / calendar hide finished work unless asked.
  const filtered = useMemo(() => (showDone ? matching : matching.filter((t) => !isDone(t))), [matching, showDone]);

  const groups: Group[] = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", tasks: filtered }];
    if (groupBy === "board")
      // Like Asana sections: every status shows (even empty) so you can add straight into it
      return BOARD_COLUMNS.filter((c) => showDone || c.key !== "completed").map((c) => ({
        key: c.key,
        label: c.label,
        color: c.dot,
        tasks: filtered.filter((t) => boardColumn(t) === c.key),
      }));
    if (groupBy === "stage")
      return STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.dot, tasks: filtered.filter((t) => computeStage(t).key === g.key) })).filter(
        (g) => g.tasks.length,
      );
    if (groupBy === "priority")
      return PRIORITIES.map((p) => ({ key: p, label: p, tasks: filtered.filter((t) => t.priority === p) })).filter((g) => g.tasks.length);
    if (groupBy === "campaign") {
      const m = new Map<string, Group>();
      for (const t of filtered) {
        const k = t.campaignId ?? "none";
        if (!m.has(k)) m.set(k, { key: k, label: t.campaignName ?? "No campaign", color: t.brandColor ?? "#5b3fd1", tasks: [] });
        m.get(k)!.tasks.push(t);
      }
      return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    }
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
  }, [filtered, groupBy, showDone]);

  // Quick add
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBrand, setNewBrand] = useState(props.fixedBrandId ?? (brands[0]?.id ?? ""));
  const [newCampaign, setNewCampaign] = useState("");
  const [newWorkType, setNewWorkType] = useState("");
  const [newType, setNewType] = useState<string>("Reel");
  const [newPlatform, setNewPlatform] = useState<string>("Instagram");
  const [newStorage, setNewStorage] = useState<string>("");
  const [newDriveUrl, setNewDriveUrl] = useState<string>("");
  const [newContext, setNewContext] = useState<string>("");
  const [newVersion, setNewVersion] = useState(1);
  const [newPerson, setNewPerson] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newExtDue, setNewExtDue] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newPrio, setNewPrio] = useState("Medium");
  const [newCollabs, setNewCollabs] = useState<string[]>([]);
  const [newSubtasks, setNewSubtasks] = useState<{ title: string; assigneeId?: string; dueDate?: string }[]>([]);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [subtaskAssignee, setSubtaskAssignee] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [moreNew, setMoreNew] = useState(false);
  const [createIssueModalOpen, setCreateIssueModalOpen] = useState(false);
  const newTitleRef = useRef<HTMLInputElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const activeBrandId = newBrand || props.fixedBrandId || brandF || (brands[0]?.id ?? "");
  const availableCampaigns = useMemo(() => {
    const b = brands.find((x) => x.id === activeBrandId);
    return b?.campaigns ?? [];
  }, [brands, activeBrandId]);

  useEffect(() => {
    if (availableCampaigns.length > 0 && (!newCampaign || !availableCampaigns.some((c) => c.id === newCampaign))) {
      setNewCampaign(availableCampaigns[0].id);
    }
  }, [availableCampaigns, newCampaign]);

  function autoFormatTitle() {
    const b = brands.find((x) => x.id === activeBrandId);
    const c = availableCampaigns.find((x) => x.id === newCampaign);
    const raw = newTitle.replace(/^.* - v\d+$/i, "").trim() || newType || "Deliverable 01";
    setNewTitle(`${b?.name ?? "Brand"} - ${c?.name ?? "Campaign"} - ${raw} - v${newVersion}`);
  }

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => !filterRef.current?.contains(e.target as Node) && setFilterOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  useEffect(() => {
    if (search.get("new") === "1" && mode !== "archive") setAdding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quickAdd = useCallback(
    async (groupKey: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      const g = view === "board" ? "board" : groupBy;
      const targetBrandId = g === "brand" && groupKey !== "none" ? groupKey : props.fixedBrandId ?? brands[0]?.id ?? "";
      const targetBrand = brands.find((b) => b.id === targetBrandId);
      const targetCampaignId = g === "campaign" && groupKey !== "none" ? groupKey : targetBrand?.campaigns?.[0]?.id ?? "";
      if (!targetBrandId || !targetCampaignId) {
        flash("Please use the '+ Add task' button to select a brand and campaign.");
        setAdding(true);
        return;
      }
      try {
        const created = await createTask({
          title: t,
          brandId: targetBrandId,
          campaignId: targetCampaignId,
          assigneeId: g === "assignee" && groupKey !== "none" ? groupKey : null,
          priority: g === "priority" ? groupKey : "Medium",
        });
        setTasks((ts) => [created, ...ts]);
        if (g === "board") {
          const patch = dropPatch(created, groupKey as BoardKey);
          if (patch) onUpdate(created.id, patch);
        }
        syncSoon();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Couldn't add task");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, groupBy, props.fixedBrandId, brands, onUpdate, syncSoon],
  );

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (!activeBrandId) {
      flash("A task cannot be saved without a brand. Please select a brand.");
      return;
    }
    if (!newCampaign) {
      flash("A task cannot be saved without a campaign. Please select a campaign.");
      return;
    }
    start(async () => {
      try {
        const t = await createTask({
          title: newTitle.trim(),
          brandId: activeBrandId,
          campaignId: newCampaign,
          type: newType || null,
          workType: newWorkType || null,
          version: newVersion || 1,
          platform: newPlatform || null,
          storageId: newStorage || null,
          assigneeId: newPerson || null,
          internalDeadline: newDue || null,
          externalDeadline: newExtDue || null,
          startAt: fromInputDateTime(newStart),
          endAt: fromInputDateTime(newEnd),
          priority: newPrio,
          context: newContext.trim() || null,
          collaboratorIds: newCollabs,
          initialDriveUrl: newDriveUrl.trim() || null,
          initialSubtasks: newSubtasks.length > 0 ? newSubtasks : undefined,
        });
        setTasks((ts) => [t, ...ts]);
        syncSoon();
        setNewTitle("");
        setNewContext("");
        setNewDriveUrl("");
        setNewSubtasks([]);
        setNewCollabs([]);
        setNewStart("");
        setNewEnd("");
        setTimeout(() => newTitleRef.current?.focus(), 0);
        flash(`${t.code} created with full specifications & bits!`);
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

  const inProgressCount = useMemo(() => matching.filter((t) => ["ongoing", "submitted"].includes(boardColumn(t))).length, [matching]);
  const approvalCount = useMemo(() => matching.filter((t) => boardColumn(t) === "approval").length, [matching]);
  const feedbackCount = useMemo(() => matching.filter((t) => boardColumn(t) === "revision").length, [matching]);
  const doneCount = useMemo(() => matching.filter((t) => isDone(t)).length, [matching]);

  return (
    <div className="flex h-full min-h-0">
      <Page className="flex-1 min-w-0">
        {/* Editorial Topbar inspired by Email-System / Brae */}
        <PageTopbar
          eyebrow={props.title}
          subtitle={props.subtitle || "Creative Post-Production Project"}
        >
          {props.headerExtra}

          {/* View Switcher Tabs */}
          <div data-tour="view-tabs" className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-md dark:bg-white/10 shrink-0">
            {([
              ["board", Columns3, "Board"],
              ["list", List, "List"],
              ["calendar", CalendarDays, "Timeline"],
              ["dashboard", BarChart3, "Dashboard"],
            ] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded transition-colors shrink-0 whitespace-nowrap select-none",
                  view === v
                    ? "bg-white text-slate-950 shadow-2xs dark:bg-[#161B22] dark:text-white"
                    : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                <Icon className="size-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {canCreate && (
            <TopbarAction
              variant="primary"
              onClick={() => setAdding((a) => !a)}
              icon={<Plus className="size-3.5 stroke-[2.5]" />}
            >
              Add deliverable
            </TopbarAction>
          )}
        </PageTopbar>

        {/* Dense StatStrip */}
        <StatStrip cols={5}>
          <Stat label="Total Deliverables" value={matching.length} sub={`${tasks.length} total across brand`} />
          <Stat label="In Progress" value={inProgressCount} tone="blue" />
          <Stat label="Sent for Approval" value={approvalCount} tone="amber" />
          <Stat label="Feedback & Fixes" value={feedbackCount} tone={feedbackCount > 0 ? "red" : undefined} accent={feedbackCount > 0} />
          <Stat label="Completed" value={doneCount} tone="green" last />
        </StatStrip>

        {/* SectionBar: Filters */}
        <SectionBar label="FILTERS" count={`${(view === "board" ? matching : filtered).length} items`}>
          {/* Quick Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find in this view..."
              className="h-6 w-36 rounded border border-stone-200/90 bg-white py-0.5 pl-6 pr-2 text-[11.5px] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:w-48 focus:border-[#FFE600] dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-white"
            />
          </div>

          {/* "Only my issues" */}
          {viewer.id && (
            <button
              onClick={() => setPersonF((prev) => (prev === viewer.id ? "" : viewer.id))}
              className={cn(
                "h-6 px-2 rounded text-[11px] font-semibold border transition-colors",
                personF === viewer.id
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950"
                  : "bg-white text-slate-700 border-stone-200 hover:bg-slate-50 dark:bg-[#161B22] dark:text-slate-300 dark:border-[#2C3B53]"
              )}
            >
              Only my issues
            </button>
          )}

          {/* Assignees */}
          {viewer.seeAll && people.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 border-l border-stone-200/70 dark:border-[#2C3B53] pl-2">
              {people.slice(0, 5).map((p) => {
                const isSelected = personF === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPersonF((prev) => (prev === p.id ? "" : p.id))}
                    className={cn(
                      "rounded-full p-0.5 transition-all",
                      isSelected ? "ring-2 ring-blue-600 ring-offset-1 scale-105" : "opacity-75 hover:opacity-100"
                    )}
                    title={`Filter by ${p.name}`}
                  >
                    <Avatar name={p.name} size={18} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1"
              onClick={() => {
                setBrandF("");
                setCampaignF("");
                setPersonF("");
                setPrioF("");
                setQ("");
              }}
            >
              Clear filters ({activeFilters})
            </button>
          )}

          {/* Grouping */}
          {view === "list" && (
            <label className="relative h-6 px-2 rounded border border-stone-200 bg-white dark:border-[#2C3B53] dark:bg-[#161B22] inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <Rows3 className="size-3" />
              <span>Group</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              >
                <option value="board">Status</option>
                <option value="campaign">Campaign</option>
                {!props.fixedBrandId && <option value="brand">Brand</option>}
                {viewer.seeAll && <option value="assignee">Assignee</option>}
                <option value="priority">Priority</option>
                <option value="none">No grouping</option>
              </select>
            </label>
          )}

          {mode !== "archive" && view !== "board" && (
            <button
              onClick={() => setShowDone((v) => !v)}
              className={cn(
                "h-6 px-2 rounded text-[11px] font-medium border border-stone-200 bg-white dark:border-[#2C3B53] dark:bg-[#161B22] inline-flex items-center gap-1",
                showDone && "bg-stone-100 dark:bg-white/10 font-bold"
              )}
            >
              <CheckCircle2 className="size-3" />
              <span>{showDone ? "Hide done" : "Show done"}</span>
            </button>
          )}
        </SectionBar>

        {/* Campaign Pills Bar */}
        {(() => {
          const currentBrandObj = props.fixedBrandId
            ? brands.find((b) => b.id === props.fixedBrandId)
            : brandF
            ? brands.find((b) => b.id === brandF)
            : null;

          if (!currentBrandObj) return null;
          const campList = currentBrandObj.campaigns ?? [];

          return (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-stone-200/60 bg-[#FAF9F5]/30 px-5 py-1.5 scroll-thin dark:border-[#2C3B53] dark:bg-[#0B0E14]">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mr-1 shrink-0">
                CAMPAIGN:
              </span>
              <button
                type="button"
                onClick={() => setCampaignF("")}
                className={cn(
                  "h-6 inline-flex items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition shrink-0 border",
                  !campaignF
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950 shadow-2xs"
                    : "bg-white text-slate-600 border-stone-200 hover:text-slate-900 dark:bg-[#161B22] dark:border-[#2C3B53] dark:text-slate-400"
                )}
              >
                <span>All Campaigns</span>
                <span className={cn("text-[9px] rounded-full px-1", !campaignF ? "bg-white/20 text-white dark:bg-black/20 dark:text-black" : "bg-black/5 text-slate-500")}>
                  {tasks.filter((t) => (!props.fixedBrandId && brandF ? t.brandId === brandF : true)).length}
                </span>
              </button>

              {campList.map((c) => {
                const count = tasks.filter((t) => t.campaignId === c.id).length;
                const isSelected = campaignF === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCampaignF(isSelected ? "" : c.id)}
                    className={cn(
                      "h-6 inline-flex items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition shrink-0 border",
                      isSelected
                        ? "bg-[#FFE600] text-slate-950 border-black/10 shadow-2xs font-bold"
                        : "bg-white text-slate-700 border-stone-200 hover:border-slate-400 dark:bg-[#161B22] dark:border-[#2C3B53] dark:text-slate-300"
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: props.accentColor || currentBrandObj.color || "#5b3fd1" }} />
                    <span>{c.name}</span>
                    <span className={cn("text-[9px] rounded-full px-1", isSelected ? "bg-black/10 text-slate-950" : "bg-black/5 dark:bg-white/10")}>
                      {count}
                    </span>
                  </button>
                );
              })}

              {canCreate && (
                <button
                  type="button"
                  onClick={() => setCreateCampaignModalOpen(true)}
                  className="h-6 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition shrink-0 cursor-pointer ml-1"
                  title={`Add new campaign to ${currentBrandObj.name}`}
                >
                  <Plus className="size-3 stroke-[2.5]" />
                  <span>Add campaign</span>
                </button>
              )}
            </div>
          );
        })()}

        <PageBody>

        {adding && canCreate && (
          <div className="border-b border-line bg-canvas/60 p-4 md:px-6">
            <form onSubmit={submitNew} className="rounded-xl border border-line bg-surface p-4 shadow-sm space-y-3 transition-all focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={newTitleRef}
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                  placeholder="Deliverable title (e.g. Reel 01)"
                  className="field-input min-w-[240px] flex-1 font-medium"
                />
                <button
                  type="button"
                  onClick={autoFormatTitle}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12px] font-semibold text-accent shadow-xs hover:bg-accent/10 transition-colors"
                  title="Auto-format as Brand - Campaign - Title - Version"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Auto-title
                </button>
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12px] text-muted shadow-xs" title="Due date">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="bg-transparent text-ink outline-none" />
                </label>
                {canAssign && (
                  <select value={newPerson} onChange={(e) => setNewPerson(e.target.value)} className="field-input w-auto py-1 font-medium">
                    <option value="">{viewer.seeAll ? "Assignee" : "Me"}</option>
                    {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <button type="submit" className="btn-primary shadow-xs px-4" disabled={!newTitle.trim()}>Create</button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors cursor-pointer",
                    moreNew
                      ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 shadow-2xs"
                      : "border-line bg-canvas text-muted hover:text-ink hover:bg-canvas/80"
                  )}
                  onClick={() => setMoreNew((m) => !m)}
                  title="Toggle creative brief, child subtasks/bits, storage drive, and timeline"
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>{moreNew ? "Hide details & bits" : "More details & bits"}</span>
                  {(newSubtasks.length > 0 || newContext.trim() || newDriveUrl.trim()) && (
                    <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateIssueModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-ink hover:bg-canvas/80 transition-colors cursor-pointer"
                  title="Open full Jira-style create issue dialog"
                >
                  <Maximize2 className="size-3.5" />
                  <span className="hidden sm:inline">Full Dialog</span>
                </button>
                <button type="button" className="btn-ghost text-[12px]" onClick={() => setAdding(false)}>Cancel</button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-line/60 pt-2.5 text-[12px]">
                {!props.fixedBrandId && (
                  <label className="flex items-center gap-1.5 font-semibold text-muted">
                    Brand:
                    <select
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                      className="field-input w-auto py-1 font-normal text-ink"
                      required
                    >
                      <option value="">Select Brand *</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Campaign:
                  <div className="inline-flex items-center gap-1">
                    <select
                      value={newCampaign}
                      onChange={(e) => {
                        if (e.target.value === "__create_campaign__") {
                          setCreateCampaignModalOpen(true);
                        } else {
                          setNewCampaign(e.target.value);
                        }
                      }}
                      className="field-input w-auto py-1 font-normal text-ink"
                      required
                    >
                      <option value="">Select Campaign *</option>
                      {availableCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__create_campaign__" className="font-semibold text-blue-600 dark:text-blue-400">
                        + Add new campaign...
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setCreateCampaignModalOpen(true)}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:underline cursor-pointer transition shrink-0"
                      title="Create new campaign in this brand"
                    >
                      <Plus className="size-3 stroke-[2.5]" />
                      <span>Add</span>
                    </button>
                  </div>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Work type:
                  <select
                    value={newWorkType}
                    onChange={(e) => setNewWorkType(e.target.value)}
                    className="field-input w-auto py-1 font-normal text-ink"
                  >
                    <option value="">Work type...</option>
                    {WORK_TYPES.map((wt) => <option key={wt} value={wt}>{wt}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Type:
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="field-input w-auto py-1 font-normal text-ink"
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Platform:
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="field-input w-auto py-1 font-normal text-ink"
                  >
                    {PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Priority:
                  <select
                    value={newPrio}
                    onChange={(e) => setNewPrio(e.target.value)}
                    className="field-input w-auto py-1 font-semibold text-ink"
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  Version:
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={newVersion}
                    onChange={(e) => setNewVersion(Math.max(1, parseInt(e.target.value) || 1))}
                    className="field-input w-16 py-1 font-mono text-center text-ink"
                  />
                </label>
              </div>

              {moreNew && (
                <div className="space-y-4 border-t border-line/70 pt-3.5 mt-2 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left Column: Brief & The Subtask Bits (7 cols) */}
                    <div className="lg:col-span-7 space-y-3.5">
                      {/* Assigner Brief & Instructions */}
                      <div className="rounded-lg border border-line bg-canvas/40 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
                            <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Creative Brief & Assigner Specifications</span>
                          </label>
                          <span className="text-[10px] text-muted font-medium">Visible to assignee & team</span>
                        </div>
                        <textarea
                          rows={3}
                          value={newContext}
                          onChange={(e) => setNewContext(e.target.value)}
                          placeholder="Write creative brief, guidelines, target duration, hook instructions, reference audio/links, or key notes for the editor..."
                          className="field-input w-full text-[12.5px] py-1.5 leading-relaxed resize-none"
                        />
                      </div>

                      {/* Subtask Bits & Checklist ("The Bits") */}
                      <div className="rounded-lg border border-line bg-canvas/40 p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
                            <CheckSquare className="size-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Child Issues / Subtasks ("The Bits") ({newSubtasks.length})</span>
                          </label>
                          {/* Quick Template Chips */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted">Templates:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const items = [
                                  "Ingest & Footage Selects",
                                  "Rough Assembly Cut",
                                  "Sound Design & Audio Mix",
                                  "Color Grading & Look",
                                  "Master Export & QC",
                                ].map((t) => ({ title: t, assigneeId: newPerson || undefined, dueDate: newDue || undefined }));
                                setNewSubtasks((prev) => [...prev, ...items]);
                              }}
                              className="text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                            >
                              + Post Flow
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const items = [
                                  "Hook & Pacing Assembly",
                                  "Captions & Kinetic Typography",
                                  "Music Sync & SFX",
                                  "9:16 Render",
                                ].map((t) => ({ title: t, assigneeId: newPerson || undefined, dueDate: newDue || undefined }));
                                setNewSubtasks((prev) => [...prev, ...items]);
                              }}
                              className="text-[10.5px] font-semibold text-purple-600 dark:text-purple-400 hover:underline px-1 py-0.5 rounded hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer"
                            >
                              + Social Reel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const items = [
                                  "Review Client Feedback",
                                  "Apply Trim Fixes & V2 Export",
                                ].map((t) => ({ title: t, assigneeId: newPerson || undefined, dueDate: newDue || undefined }));
                                setNewSubtasks((prev) => [...prev, ...items]);
                              }}
                              className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 hover:underline px-1 py-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                            >
                              + Revision
                            </button>
                          </div>
                        </div>

                        {/* Add Subtask Input Bar */}
                        <div className="flex items-center gap-1.5">
                          <input
                            value={subtaskInput}
                            onChange={(e) => setSubtaskInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (subtaskInput.trim()) {
                                  setNewSubtasks((prev) => [
                                    ...prev,
                                    {
                                      title: subtaskInput.trim(),
                                      assigneeId: subtaskAssignee || newPerson || undefined,
                                      dueDate: subtaskDueDate || newDue || undefined,
                                    },
                                  ]);
                                  setSubtaskInput("");
                                }
                              }
                            }}
                            placeholder="Add subtask / bit (e.g. Rough Cut, Sound Design) [Enter]..."
                            className="field-input flex-1 py-1 text-[12px]"
                          />
                          <select
                            value={subtaskAssignee}
                            onChange={(e) => setSubtaskAssignee(e.target.value)}
                            className="field-input w-28 py-1 text-[11.5px]"
                          >
                            <option value="">{newPerson ? "Default" : "Assignee"}</option>
                            {people.filter((p) => p.active).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={subtaskDueDate}
                            onChange={(e) => setSubtaskDueDate(e.target.value)}
                            className="field-input w-32 py-1 text-[11.5px]"
                            title="Subtask due date"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (subtaskInput.trim()) {
                                setNewSubtasks((prev) => [
                                  ...prev,
                                  {
                                    title: subtaskInput.trim(),
                                    assigneeId: subtaskAssignee || newPerson || undefined,
                                    dueDate: subtaskDueDate || newDue || undefined,
                                  },
                                ]);
                                setSubtaskInput("");
                              }
                            }}
                            disabled={!subtaskInput.trim()}
                            className="btn-primary py-1 px-3 text-[11.5px] shrink-0"
                          >
                            Add
                          </button>
                        </div>

                        {/* Added Subtasks List */}
                        {newSubtasks.length > 0 && (
                          <div className="space-y-1 max-h-44 overflow-y-auto scroll-thin pt-1">
                            {newSubtasks.map((st, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-surface border border-line text-[12px]"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="size-4 rounded border border-line flex items-center justify-center text-[10px] text-muted font-mono shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="font-medium text-ink truncate">{st.title}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {st.assigneeId && (
                                    <span className="text-[11px] text-muted bg-canvas px-1.5 py-0.5 rounded">
                                      {people.find((p) => p.id === st.assigneeId)?.name}
                                    </span>
                                  )}
                                  {st.dueDate && (
                                    <span className="text-[10.5px] font-mono text-muted">
                                      {st.dueDate}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setNewSubtasks((prev) => prev.filter((_, i) => i !== idx))}
                                    className="text-muted hover:text-rose-600 transition p-0.5 cursor-pointer"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Storage, Assets & Collaborators (5 cols) */}
                    <div className="lg:col-span-5 space-y-3.5">
                      {/* Master Footage & Drive Link */}
                      <div className="rounded-lg border border-line bg-canvas/40 p-3 space-y-2">
                        <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
                          <FolderGit2 className="size-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Master Drive & Raw Footage</span>
                        </label>
                        <input
                          type="url"
                          value={newDriveUrl}
                          onChange={(e) => setNewDriveUrl(e.target.value)}
                          placeholder="Paste Google Drive folder / footage link..."
                          className="field-input w-full text-[12px] py-1"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-[11px] text-muted font-medium shrink-0 flex items-center gap-1">
                            <HardDrive className="size-3" /> Storage NAS:
                          </label>
                          <select
                            value={newStorage}
                            onChange={(e) => setNewStorage(e.target.value)}
                            className="field-input flex-1 py-0.5 text-[11.5px]"
                          >
                            <option value="">Select NAS / Storage...</option>
                            {storages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Client Deadline & Planned Schedule */}
                      <div className="rounded-lg border border-line bg-canvas/40 p-3 space-y-2">
                        <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
                          <CalendarDays className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Timeline & Client Air Date</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                          <div>
                            <span className="text-[10px] text-muted font-medium block mb-0.5">Client Air Date</span>
                            <input
                              type="date"
                              value={newExtDue}
                              onChange={(e) => setNewExtDue(e.target.value)}
                              className="field-input w-full py-1 text-[11.5px]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-muted font-medium block mb-0.5">Priority</span>
                            <select
                              value={newPrio}
                              onChange={(e) => setNewPrio(e.target.value)}
                              className="field-input w-full py-1 text-[11.5px] font-semibold"
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p} Priority
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted font-medium block mb-0.5">Start Work</span>
                            <input
                              type="datetime-local"
                              value={newStart}
                              onChange={(e) => setNewStart(e.target.value)}
                              className="field-input w-full py-1 text-[11px]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-muted font-medium block mb-0.5">Target Finish</span>
                            <input
                              type="datetime-local"
                              value={newEnd}
                              onChange={(e) => setNewEnd(e.target.value)}
                              className="field-input w-full py-1 text-[11px]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Collaborators */}
                      <div className="rounded-lg border border-line bg-canvas/40 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
                            <Users className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Collaborators & Reviewers</span>
                          </label>
                          <select
                            value=""
                            onChange={(e) => e.target.value && setNewCollabs((c) => [...new Set([...c, e.target.value])])}
                            className="field-input w-auto py-0.5 text-[11px]"
                          >
                            <option value="">+ Add Collaborator</option>
                            {people
                              .filter((p) => p.active && p.id !== viewer.id && !newCollabs.includes(p.id))
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        {newCollabs.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {newCollabs.map((id) => (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-surface border border-line px-2 py-0.5 text-[11px] font-medium"
                              >
                                <Avatar name={people.find((p) => p.id === id)?.name || "User"} size={14} />
                                <span>{people.find((p) => p.id === id)?.name}</span>
                                <button
                                  type="button"
                                  className="text-muted hover:text-ink ml-0.5"
                                  onClick={() => setNewCollabs((c) => c.filter((x) => x !== id))}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted">No additional collaborators selected.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}

        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-10 pt-1 md:px-6">
          {view === "list" && (
            filtered.length === 0 && groupBy !== "board" ? (
              <div className="py-20 text-center text-[13px] text-muted">
                {mode === "mine" ? "Nothing on your plate right now. Click \"Add task\" to create one, then click the task to open it (comments are at the bottom)." : "No tasks match these filters."}
              </div>
            ) : (
              <>
              <div className="md:hidden">
                <TaskCards
                  groups={groups}
                  viewer={viewer}
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
                showAssignee={mode !== "mine"}
                showBrand={!props.fixedBrandId}
                selectedId={selectedId}
                onOpen={(id) => open(id)}
                onUpdate={onUpdate}
                onQuickAdd={canCreate && groupBy !== "none" && mode !== "all" ? quickAdd : undefined}
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
                onQuickAdd={canCreate ? quickAdd : undefined}
              />
            </div>
          )}
          {view === "calendar" && <div className="pt-3"><TaskCalendar tasks={filtered} seeAll={viewer.seeAll} onOpen={(id) => open(id)} /></div>}
          {view === "dashboard" && (
            <div className="pt-3">
              <ProjectDashboardView
                tasks={matching}
                people={people}
                brands={brands}
                brandName={props.fixedBrandId ? props.title : undefined}
                brandColor={props.accentColor}
                isStudioWide={props.mode === "all"}
              />
            </div>
          )}
          </div>
        </PageBody>
      </Page>

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

      <CreateCampaignModal
        isOpen={createCampaignModalOpen}
        onClose={() => setCreateCampaignModalOpen(false)}
        brandId={activeBrandId}
        brandName={brands.find((b) => b.id === activeBrandId)?.name || props.title || "Brand"}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        onCreated={(campaign) => {
          setBrands((prev) =>
            prev.map((b) =>
              b.id === campaign.brandId
                ? {
                    ...b,
                    campaigns: [
                      ...(b.campaigns || []).filter((c) => c.id !== campaign.id),
                      campaign,
                    ],
                  }
                : b
            )
          );
          setNewCampaign(campaign.id);
          flash(`Campaign "${campaign.name}" created!`);
          router.refresh();
        }}
      />

      {/* Full Jira-style Create Issue Modal */}
      <CreateIssueModal
        isOpen={createIssueModalOpen}
        onClose={() => setCreateIssueModalOpen(false)}
        brands={brands}
        people={people}
        defaultBrandId={activeBrandId}
        defaultCampaignId={newCampaign}
      />

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-[13px] text-surface shadow-pop">{toast}</div>
      )}
    </div>
  );
}
