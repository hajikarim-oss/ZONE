"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bell, Briefcase, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, FolderKanban,
  Grid, LayoutDashboard, LogOut, Plus, Search, Sparkles, Target, User, Users, X
} from "lucide-react";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { ROLE_LABEL } from "@/lib/constants";
import CreateIssueModal from "./jira/CreateIssueModal";
import CreateBrandModal from "./brands/CreateBrandModal";
import UniversalSearchModal from "./search/UniversalSearchModal";
import type { BrandDTO, PersonDTO } from "@/lib/dto";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string;
  role: string;
  unreadCount?: number;
  brands?: BrandDTO[];
  people?: PersonDTO[];
};

export default function TopBar({
  name,
  email,
  role,
  unreadCount = 0,
  brands = [],
  people = [],
}: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(path === "/search" ? params.get("q") ?? "" : "");
  const [menu, setMenu] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const brandPickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active brand detection from URL
  const brandMatch = path.match(/^\/brands\/([^/?]+)/);
  const activeBrandId = brandMatch ? brandMatch[1] : null;
  const currentBrand = activeBrandId ? brands.find((b) => b.id === activeBrandId) : null;

  // Shortcuts: "/" or "mod+k" opens universal search, "c" opens create issue dialog
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) &&
        !t.isContentEditable
      ) {
        e.preventDefault();
        setSearchModalOpen(true);
      }
      if (e.key === "c" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setCreateModalOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
      if (!brandPickerRef.current?.contains(e.target as Node)) setBrandPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Section crumb label (avoid duplicating brand name already shown in project switcher)
  const sectionLabel = (() => {
    if (path === "/home") return null;
    if (path === "/my-tasks") return "Assigned to me";
    if (path === "/portfolios") return "Plans & Roadmaps";
    if (path === "/projects") return "All Projects";
    if (path === "/team") return "Team & Access";
    if (path === "/brands") return "Brands & Clients";
    if (path === "/automations") return "Automations";
    if (path === "/inbox") return "Notifications";
    if (path === "/archive") return "Completed Archive";
    if (currentBrand) {
      const campaignId = params.get("campaign");
      if (campaignId) {
        const camp = currentBrand.campaigns?.find((c) => c.id === campaignId);
        return camp ? camp.name : "Campaign";
      }
      return null;
    }
    return "Workspace";
  })();

  return (
    <>
      <header className="h-12 shrink-0 items-center justify-between border-b border-stone-200/90 bg-[#FAF9F5] px-3 md:px-5 flex z-30 select-none dark:border-[#2C3B53] dark:bg-[#0B0E14]">
        {/* Left Section: Continuous Brae/Email-System breadcrumb bar */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Logo zone */}
          <Link href="/home" className="flex items-center gap-2 group shrink-0 pr-2">
            <Logo className="h-5 w-auto" />
            <span className="hidden lg:inline-block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Post-Production
            </span>
          </Link>

          <ChevronRight className="h-3.5 w-3.5 text-stone-300 dark:text-stone-700 shrink-0" />

          {/* Brand / Project Switcher Dropdown */}
          <div ref={brandPickerRef} className="relative shrink-0">
            <button
              onClick={() => setBrandPickerOpen((o) => !o)}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors text-left"
            >
              <span
                className="size-4.5 rounded-[4px] flex items-center justify-center shrink-0 text-white text-[10px] font-bold shadow-2xs"
                style={{ backgroundColor: currentBrand?.color || "#5b3fd1" }}
              >
                {(currentBrand?.name || "TBM").slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate max-w-[140px] md:max-w-[200px]">
                {currentBrand?.name || "All Brands"}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {brandPickerOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-stone-200 bg-white p-1.5 shadow-pop z-50 dark:border-[#2C3B53] dark:bg-[#161B22]">
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  <span>Select Project</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandPickerOpen(false);
                      setCreateBrandOpen(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                  >
                    <Plus className="size-3" /> Add brand
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-0.5 scroll-thin">
                  <Link
                    href="/projects"
                    onClick={() => setBrandPickerOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-slate-400" />
                    <span>All Projects Directory</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandPickerOpen(false);
                      setCreateBrandOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-white/10 transition-colors text-left cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ Add New Brand</span>
                  </button>
                  <div className="my-1 border-t border-stone-200 dark:border-[#2C3B53]" />
                  {brands.map((b) => (
                    <Link
                      key={b.id}
                      href={`/brands/${b.id}`}
                      onClick={() => setBrandPickerOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors",
                        b.id === activeBrandId
                          ? "bg-[#FFE600]/20 text-slate-950 font-semibold dark:bg-[#FFE600]/10 dark:text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                      )}
                    >
                      <span
                        className="size-3.5 rounded-[3px] shrink-0"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="truncate flex-1">{b.name}</span>
                      {(b.campaigns?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {b.campaigns!.length} camps
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section Breadcrumb */}
          {sectionLabel && (
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 text-stone-300 dark:text-stone-700 shrink-0" />
              <span className="text-[12.5px] font-medium text-slate-600 dark:text-slate-400 truncate">
                {sectionLabel}
              </span>
            </div>
          )}
        </div>

        {/* Right Section: Telemetry, Search, Create Button & User Nav */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Ambient Real-time Pulse */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Studio Live</span>
          </div>

          {/* Universal Search Trigger (Desktop) */}
          <div
            onClick={() => setSearchModalOpen(true)}
            className="relative hidden md:flex items-center cursor-pointer group select-none"
            title="Universal Search for drives, projects, files & team (⌘K)"
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors" />
            <div className="h-7 w-44 lg:w-56 rounded-md border border-stone-200/90 bg-white/80 py-1 pl-8 pr-8 text-[12px] text-slate-400 transition-all group-hover:border-[#FFE600] group-hover:bg-white flex items-center shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-400 dark:group-hover:border-[#FFE600]">
              <span className="truncate">Search drives &amp; projects...</span>
            </div>
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-stone-300/80 bg-stone-100 px-1 py-0.2 font-mono text-[9px] font-semibold text-slate-500 dark:border-[#2C3B53] dark:bg-[#0F141C]">
              ⌘K
            </kbd>
          </div>

          {/* Universal Search Trigger (Mobile icon) */}
          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            className="md:hidden flex items-center justify-center size-7 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Search drives & projects"
          >
            <Search className="size-4" />
          </button>

          {/* Notifications Bell */}
          <Link
            href="/inbox"
            className="relative flex items-center justify-center size-7 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-white/10 transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 size-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0B0E14]" />
            )}
          </Link>

          {/* Primary Create Button (Email-System Apollo Yellow Style) */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="h-7 px-3 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 font-bold text-[12px] shadow-xs border border-black/10 inline-flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
            title="Create Deliverable (shortcut: c)"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Create</span>
            <kbd className="hidden lg:inline-block text-[9px] font-mono opacity-60">c</kbd>
          </button>

          <div className="h-4 w-px bg-stone-300 dark:bg-stone-700 mx-0.5 hidden sm:block" />

          {/* User Nav */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-1.5 rounded-md p-1 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
              title={name}
            >
              <Avatar name={name} size={24} />
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {menu && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-stone-200 bg-white p-1.5 text-[12.5px] text-slate-800 shadow-pop z-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200">
                <div className="border-b border-stone-200 px-3 py-2 dark:border-[#2C3B53]">
                  <div className="font-semibold text-slate-950 dark:text-white truncate">{name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{email}</div>
                  <div className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[#0F141C] dark:text-slate-400">
                    {ROLE_LABEL[role] ?? role}
                  </div>
                </div>

                <div className="py-1 space-y-0.5">
                  <Link
                    href="/my-tasks"
                    onClick={() => setMenu(false)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" /> My Tasks
                  </Link>
                  <Link
                    href="/guide"
                    onClick={() => setMenu(false)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <CircleHelp className="h-3.5 w-3.5 text-slate-500" /> Help & Documentation
                  </Link>
                </div>

                <div className="border-t border-stone-200 pt-1 dark:border-[#2C3B53]">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Create Issue Dialog */}
      <CreateIssueModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        brands={brands}
        people={people}
        defaultBrandId={activeBrandId || undefined}
      />

      {/* Global Create Brand Dialog */}
      <CreateBrandModal
        isOpen={createBrandOpen}
        onClose={() => setCreateBrandOpen(false)}
      />

      {/* Universal Search Modal (Drives, Projects, Files, Brands, Team) */}
      <UniversalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        initialQuery={q}
      />
    </>
  );
}
