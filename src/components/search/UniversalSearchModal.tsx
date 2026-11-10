"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  HardDrive,
  Folder,
  Layers,
  Building2,
  Users,
  Film,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  Command,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { JiraIssueKey, JiraIssueTypeIcon, JiraStatusLozenge } from "@/components/jira/JiraBits";
import { cn } from "@/lib/utils";

type Tab = "all" | "projects" | "storage" | "brands" | "people";

type UniversalSearchResults = {
  query: string;
  projects: any[];
  storageItems: any[];
  brands: any[];
  people: any[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
};

export default function UniversalSearchModal({ isOpen, onClose, initialQuery = "" }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [results, setResults] = useState<UniversalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  // Fetch search results debounced
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/universal?q=${encodeURIComponent(query.trim())}`);
        if (res.ok && active) {
          const data = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Failed to fetch search results:", err);
      } finally {
        if (active) setLoading(false);
      }
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const projects = results?.projects || [];
  const storageItems = results?.storageItems || [];
  const brands = results?.brands || [];
  const people = results?.people || [];

  const totalCount = projects.length + storageItems.length + brands.length + people.length;

  const handleCopy = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelectProject = (projectId: string) => {
    onClose();
    router.push(`/projects?task=${projectId}`);
  };

  const handleSelectStorage = (driveName: string) => {
    onClose();
    router.push(`/analytics#section-storage`);
  };

  const handleSelectBrand = (brandId: string) => {
    onClose();
    router.push(`/brands/${brandId}`);
  };

  const handleSelectPerson = (personName: string) => {
    onClose();
    router.push(`/search?q=${encodeURIComponent(personName)}`);
  };

  const handleSubmitAll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const showProjects = (activeTab === "all" || activeTab === "projects") && projects.length > 0;
  const showStorage = (activeTab === "all" || activeTab === "storage") && storageItems.length > 0;
  const showBrands = (activeTab === "all" || activeTab === "brands") && brands.length > 0;
  const showPeople = (activeTab === "all" || activeTab === "people") && people.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 md:pt-16 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden flex flex-col dark:border-[#2C3B53] dark:bg-[#121720] max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Bar */}
        <form onSubmit={handleSubmitAll} className="flex items-center gap-3 px-4 py-3.5 border-b border-stone-200 dark:border-[#2C3B53] bg-[#FAF9F5] dark:bg-[#0B0E14]">
          <Search className="size-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search everything (deliverables, hard drives, file paths, brands, team)..."
            className="flex-1 bg-transparent text-[14.5px] font-medium text-slate-900 placeholder:text-slate-400 outline-none dark:text-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-stone-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400 dark:border-[#2C3B53] dark:bg-[#161B22]">
            ESC
          </kbd>
        </form>

        {/* Universal Filter Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-stone-100 dark:border-[#2C3B53] bg-stone-50/70 dark:bg-[#0F141C] overflow-x-auto scrollbar-none text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-2.5 py-1 rounded-md transition cursor-pointer",
              activeTab === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-bold"
                : "text-slate-600 hover:bg-stone-200/60 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            All Results {results ? `(${totalCount})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer",
              activeTab === "projects"
                ? "bg-blue-600 text-white font-bold"
                : "text-slate-600 hover:bg-stone-200/60 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            <Film className="size-3" />
            <span>Deliverables ({projects.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("storage")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer",
              activeTab === "storage"
                ? "bg-indigo-600 text-white font-bold"
                : "text-slate-600 hover:bg-stone-200/60 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            <HardDrive className="size-3" />
            <span>Drives &amp; Files ({storageItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("brands")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer",
              activeTab === "brands"
                ? "bg-purple-600 text-white font-bold"
                : "text-slate-600 hover:bg-stone-200/60 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            <Building2 className="size-3" />
            <span>Brands ({brands.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("people")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer",
              activeTab === "people"
                ? "bg-emerald-600 text-white font-bold"
                : "text-slate-600 hover:bg-stone-200/60 dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            <Users className="size-3" />
            <span>Team ({people.length})</span>
          </button>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-4 max-h-[500px]">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
              <span className="size-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>Searching across drives, projects &amp; clients...</span>
            </div>
          )}

          {!loading && totalCount === 0 && (
            <div className="py-12 text-center text-slate-400">
              <Search className="size-8 mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                No matching results found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Try searching for a project ID (e.g. "TBM-011"), hard drive ("WD", "LACIE"), or client brand.
              </p>
            </div>
          )}

          {/* Section: Storage Drives & File Directories */}
          {showStorage && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <HardDrive className="size-3" /> Hard Drives &amp; Data Directories ({storageItems.length})
                </span>
                <span>TBM Studio Storage Management</span>
              </div>
              <div className="space-y-1">
                {storageItems.map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectStorage(item.storageName)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-stone-100 hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-white/5 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20 transition cursor-pointer group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="size-7 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                        <HardDrive className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[13px] text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors truncate">
                            {item.task || "Storage Directory"}
                          </span>
                          <span className="rounded bg-indigo-100/70 border border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300 px-1.5 py-0.2 text-[9.5px] font-bold">
                            {item.storageName}
                          </span>
                        </div>
                        {item.dataLocation && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Folder className="size-3 text-slate-400 shrink-0" />
                            <span className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                              {item.dataLocation}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopy(item.id, item.dataLocation, e)}
                              className="text-slate-400 hover:text-indigo-600 p-0.5 ml-1 transition"
                              title="Copy file path"
                            >
                              {copiedId === item.id ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {item.progress}
                      </span>
                      {item.outputLink && (
                        <a
                          href={item.outputLink.startsWith("http") ? item.outputLink : `https://${item.outputLink}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-600 hover:text-indigo-700 p-1"
                          title="Open deliverable link"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Deliverable Projects */}
          {showProjects && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <Film className="size-3" /> Projects &amp; Deliverables ({projects.length})
                </span>
                <span>Active Production</span>
              </div>
              <div className="space-y-1">
                {projects.map((p: any) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProject(p.id)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-stone-100 hover:border-blue-300 hover:bg-blue-50/40 dark:border-white/5 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/20 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <JiraIssueTypeIcon type={p.type} />
                      <JiraIssueKey code={p.code} />
                      <div className="min-w-0">
                        <span className="font-semibold text-[13px] text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors truncate block">
                          {p.title}
                        </span>
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 mt-0.5">
                          {p.brand && (
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {p.brand.name}
                            </span>
                          )}
                          {p.assignee && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Avatar name={p.assignee.name} size={14} />
                                <span>{p.assignee.name}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <JiraStatusLozenge status={p.deliveryStatus || p.editStatus} />
                      <ArrowRight className="size-3.5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Client Brands */}
          {showBrands && (
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Building2 className="size-3" /> Client Brands ({brands.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {brands.map((b: any) => (
                  <div
                    key={b.id}
                    onClick={() => handleSelectBrand(b.id)}
                    className="flex items-center justify-between p-2 rounded-xl border border-stone-100 hover:border-purple-300 hover:bg-purple-50/40 dark:border-white/5 dark:hover:bg-purple-950/20 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-[3px]" style={{ backgroundColor: b.color || "#8b5cf6" }} />
                      <span className="font-semibold text-[12.5px] text-slate-900 dark:text-white group-hover:text-purple-600 transition-colors">
                        {b.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {b._count?.projects || 0} deliverables →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Team Members */}
          {showPeople && (
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Users className="size-3" /> Post-Production Team ({people.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {people.map((person: any) => (
                  <div
                    key={person.id}
                    onClick={() => handleSelectPerson(person.name)}
                    className="flex items-center justify-between p-2 rounded-xl border border-stone-100 hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-white/5 dark:hover:bg-emerald-950/20 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={person.name} size={22} />
                      <div>
                        <span className="font-semibold text-[12px] text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors block">
                          {person.name}
                        </span>
                        <span className="text-[9.5px] text-slate-400 font-mono">
                          {person.department || person.role}
                        </span>
                      </div>
                    </div>
                    <span className="text-slate-300 group-hover:text-emerald-600 transition-colors text-xs">→</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="border-t border-stone-100 dark:border-[#2C3B53] px-4 py-2.5 bg-stone-50/70 dark:bg-[#0B0E14] flex flex-wrap items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono text-[9px] bg-white dark:bg-[#161B22] border border-stone-200 dark:border-[#2C3B53] px-1 rounded">↵</kbd>
              <span>to open</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono text-[9px] bg-white dark:bg-[#161B22] border border-stone-200 dark:border-[#2C3B53] px-1 rounded">esc</kbd>
              <span>to dismiss</span>
            </span>
          </div>

          {query.trim() && (
            <button
              type="button"
              onClick={handleSubmitAll}
              className="text-indigo-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>View full search workspace for “{query}”</span>
              <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

