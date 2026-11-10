"use client";

import { useMemo, useState } from "react";
import {
  HardDrive,
  FolderTree,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Filter,
  Layers,
  ChevronRight,
  Database,
  ArrowUpDown,
  Laptop,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import rawStorageData from "@/data/storage-management.json";

export type StorageItem = {
  id: string;
  task: string;
  startDate: string | null;
  endDate: string | null;
  progress: string;
  reviewer: string | null;
  storageName: string;
  dataLocation: string | null;
  outputLink: string | null;
};

type Props = {
  compact?: boolean;
  className?: string;
};

export default function DriveAndProjectSection({ compact = false, className }: Props) {
  const [selectedDrive, setSelectedDrive] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [progressFilter, setProgressFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const items: StorageItem[] = useMemo(() => {
    return rawStorageData as StorageItem[];
  }, []);

  // Aggregated drive summary (Subsheets/Drives)
  const driveStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; completed: number; inProgress: number }>();

    items.forEach((item) => {
      const drive = item.storageName || "Unassigned";
      const existing = map.get(drive) || { name: drive, total: 0, completed: 0, inProgress: 0 };
      existing.total += 1;
      if (item.progress.toLowerCase().includes("complete")) {
        existing.completed += 1;
      } else {
        existing.inProgress += 1;
      }
      map.set(drive, existing);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.name === "Unassigned") return 1;
      if (b.name === "Unassigned") return -1;
      return b.total - a.total;
    });
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Drive filter
      if (selectedDrive !== "all") {
        if (selectedDrive === "Unassigned" && item.storageName !== "Unassigned") return false;
        if (selectedDrive !== "Unassigned" && item.storageName !== selectedDrive) return false;
      }

      // Progress filter
      if (progressFilter !== "all") {
        if (progressFilter === "Completed" && !item.progress.toLowerCase().includes("complete")) return false;
        if (progressFilter === "In-progress" && item.progress.toLowerCase().includes("complete")) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTask = item.task.toLowerCase().includes(q);
        const matchLocation = (item.dataLocation || "").toLowerCase().includes(q);
        const matchDrive = item.storageName.toLowerCase().includes(q);
        const matchReviewer = (item.reviewer || "").toLowerCase().includes(q);
        if (!matchTask && !matchLocation && !matchDrive && !matchReviewer) return false;
      }

      return true;
    });
  }, [items, selectedDrive, progressFilter, searchQuery]);

  const handleCopyLocation = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getDriveBadgeColor = (name: string) => {
    if (name.includes("LACIE")) return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300";
    if (name.includes("WD")) return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300";
    if (name.includes("Samsung")) return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300";
    if (name.includes("sandisk") || name.includes("SanDisk")) return "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300";
    if (name.includes("Black")) return "bg-stone-500/10 text-stone-700 border-stone-500/20 dark:bg-stone-500/20 dark:text-stone-300";
    if (name.includes("Silver")) return "bg-teal-500/10 text-teal-600 border-teal-500/20 dark:bg-teal-500/20 dark:text-teal-300";
    return "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-400";
  };

  return (
    <div
      id="section-storage"
      className={cn(
        "rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] flex flex-col justify-between",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-[#2C3B53] bg-[#FAF9F5]/50 dark:bg-[#0F141C]">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
            <HardDrive className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight">
                Drive &amp; Project Storage Operations
              </h4>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9.5px] font-bold text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900">
                {items.length} Projects Tracked
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Master storage management: physical hard drives, project folder directories, and archival backup links
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="size-3 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drive or project..."
              className="h-7 w-36 sm:w-48 rounded-md border border-stone-200 bg-white pl-7 pr-2 text-[11px] dark:border-[#2C3B53] dark:bg-[#161B22] text-slate-900 dark:text-white outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* Status filter */}
          <select
            value={progressFilter}
            onChange={(e) => setProgressFilter(e.target.value)}
            className="h-7 rounded-md border border-stone-200 bg-white px-2 text-[10.5px] font-semibold text-slate-700 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 outline-none cursor-pointer shadow-2xs"
          >
            <option value="all">All Progress</option>
            <option value="Completed">Completed</option>
            <option value="In-progress">In-Progress</option>
          </select>
        </div>
      </div>

      {/* Subsheets / Drive Selector Bar */}
      <div className="border-b border-stone-100 dark:border-[#2C3B53] bg-stone-50/70 dark:bg-[#121720] px-4 py-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="size-3" /> Subsheets / Drives:
          </span>
          <button
            type="button"
            onClick={() => setSelectedDrive("all")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer border",
              selectedDrive === "all"
                ? "bg-white text-indigo-600 border-indigo-300 shadow-2xs dark:bg-[#1A2230] dark:text-indigo-400 dark:border-indigo-500"
                : "bg-transparent text-slate-600 border-transparent hover:bg-white/80 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            All Drives ({items.length})
          </button>

          {driveStats.map((ds) => (
            <button
              key={ds.name}
              type="button"
              onClick={() => setSelectedDrive(ds.name)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer border flex items-center gap-1.5",
                selectedDrive === ds.name
                  ? "bg-white text-indigo-600 border-indigo-300 shadow-2xs dark:bg-[#1A2230] dark:text-indigo-400 dark:border-indigo-500"
                  : "bg-transparent text-slate-600 border-transparent hover:bg-white/80 dark:text-slate-400 dark:hover:bg-white/5"
              )}
            >
              <HardDrive className="size-3 text-slate-400" />
              <span>{ds.name}</span>
              <span className="rounded-full bg-slate-200/60 dark:bg-white/10 px-1.5 py-0.2 text-[9.5px] font-mono text-slate-700 dark:text-slate-300">
                {ds.total}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Table */}
      <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-stone-200 bg-[#FAF9F5] text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-slate-400 shadow-2xs">
              <th className="py-2.5 px-4">Activity / Project Task</th>
              <th className="py-2.5">Storage Hardware</th>
              <th className="py-2.5">Data Location / Directory Path</th>
              <th className="py-2.5">Dates</th>
              <th className="py-2.5">Progress</th>
              <th className="py-2.5 px-4 text-right">Output Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                  No storage entries matching "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-stone-50/80 dark:hover:bg-[#161B22]/60 transition group"
                >
                  {/* Task / Project Name */}
                  <td className="py-2.5 px-4 max-w-[240px]">
                    <div className="flex items-center gap-2">
                      <Folder className="size-3.5 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-slate-900 dark:text-white truncate" title={item.task}>
                        {item.task || "Unnamed Task"}
                      </span>
                    </div>
                  </td>

                  {/* Storage Hardware */}
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 border",
                        getDriveBadgeColor(item.storageName)
                      )}
                    >
                      <HardDrive className="size-2.5 shrink-0" />
                      {item.storageName}
                    </span>
                  </td>

                  {/* Data Location with 1-click Copy */}
                  <td className="py-2.5 max-w-[280px]">
                    {item.dataLocation ? (
                      <div className="flex items-center gap-1.5 group/path">
                        <span
                          className="font-mono text-[10.5px] text-slate-600 dark:text-slate-300 truncate bg-stone-100 dark:bg-white/5 px-1.5 py-0.5 rounded border border-stone-200/60 dark:border-white/5"
                          title={item.dataLocation}
                        >
                          {item.dataLocation}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyLocation(item.id, item.dataLocation!)}
                          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/path:opacity-100 transition p-0.5 cursor-pointer"
                          title="Copy file path"
                        >
                          {copiedId === item.id ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Timeline */}
                  <td className="py-2.5 text-slate-500 font-mono text-[10.5px]">
                    {item.startDate || item.endDate ? (
                      <span>
                        {item.startDate || "—"} {item.endDate ? `→ ${item.endDate}` : ""}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>

                  {/* Progress Status */}
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider inline-flex items-center gap-1",
                        item.progress.toLowerCase().includes("complete")
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      )}
                    >
                      {item.progress.toLowerCase().includes("complete") ? (
                        <CheckCircle2 className="size-2.5" />
                      ) : (
                        <Clock className="size-2.5" />
                      )}
                      {item.progress}
                    </span>
                  </td>

                  {/* Output Link */}
                  <td className="py-2.5 px-4 text-right">
                    {item.outputLink ? (
                      <a
                        href={item.outputLink.startsWith("http") ? item.outputLink : `https://${item.outputLink}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[10.5px] font-bold text-indigo-700 hover:bg-indigo-100 transition dark:bg-indigo-950/40 dark:text-indigo-300 cursor-pointer"
                      >
                        <span>Open</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="border-t border-stone-100 px-4 py-2.5 dark:border-[#2C3B53] bg-stone-50/50 dark:bg-[#0F141C] flex flex-wrap items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
            <Database className="size-3 text-indigo-500" />
            {driveStats.filter((d) => d.name !== "Unassigned").length} Storage Drives
          </span>
          <span>·</span>
          <span>
            Showing <strong className="text-slate-900 dark:text-white">{filteredItems.length}</strong> of {items.length} items
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[10.5px]">
          <CheckCircle2 className="size-3" />
          <span>{items.filter((i) => i.progress.toLowerCase().includes("complete")).length} archived deliverables</span>
        </div>
      </div>
    </div>
  );
}

