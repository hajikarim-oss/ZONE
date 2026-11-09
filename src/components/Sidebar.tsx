"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import {
  Bell, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Copy, FolderGit2, FolderKanban,
  Home, Kanban, LayoutList, LogOut, Menu, MoreHorizontal, Plus, Rows3, Search, Settings, Star,
  Tags, Target, Briefcase, UserPlus, Users, X, Zap, Calendar, ArrowLeft, BookOpen, Layers, ExternalLink, Activity, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import CreateBrandModal from "@/components/brands/CreateBrandModal";
import CreateCampaignModal from "@/components/brands/CreateCampaignModal";
import { ROLE_LABEL } from "@/lib/constants";
import { createProject, toggleFavorite } from "@/lib/actions";
import { SAVED_SEARCHES } from "@/lib/saved-searches";

export type BrandSidebarItem = {
  id: string;
  name: string;
  color: string;
  repositoryUrl?: string | null;
  guidelines?: string | null;
  campaigns?: { id: string; name: string }[];
};

type Props = {
  name: string;
  email: string;
  role: string;
  seeAll: boolean;
  admin: boolean;
  unread: number;
  myOpen: number;
  brands: BrandSidebarItem[];
  favoriteIds: string[];
  team: { id: string; name: string }[];
  teamCount: number;
};

function NavRow({
  href,
  icon: Icon,
  label,
  count,
  badge,
  active,
  external,
}: {
  href: string;
  icon: any;
  label: string;
  count?: number;
  badge?: boolean;
  active: boolean;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
        )}
        strokeWidth={1.8}
      />
      <span className="flex-1 truncate">{label}</span>
      {external && <ExternalLink className="size-3 text-slate-400 shrink-0" />}
      {!!count &&
        (badge ? (
          <span className="min-w-[18px] rounded-full bg-rose-500 px-1.5 py-0.2 text-center text-[10px] font-bold text-white shadow-xs">
            {count > 99 ? "99+" : count}
          </span>
        ) : (
          <span className="font-mono text-[10.5px] rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.2 text-slate-500 dark:text-slate-400 tabular-nums">
            {count}
          </span>
        ))}
    </>
  );

  const className = cn(
    "h-8 px-2.5 rounded-md flex items-center gap-2.5 text-[12.5px] font-medium transition-colors cursor-pointer",
    active
      ? "bg-slate-200/70 font-semibold text-slate-950 dark:bg-white/10 dark:text-white shadow-2xs"
      : "text-slate-700 hover:bg-slate-200/40 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function SectionLabel({
  title,
  action,
  open,
  onToggle,
}: {
  title: string;
  action?: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 pt-3.5 pb-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        {onToggle && (open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
        <span>{title}</span>
      </button>
      {action}
    </div>
  );
}

export default function Sidebar({
  name,
  email,
  role,
  seeAll,
  admin,
  unread,
  myOpen,
  brands,
  favoriteIds,
  team,
  teamCount,
}: Props) {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "board";
  const currentCampaignId = searchParams.get("campaign");
  const [, start] = useTransition();

  // Active brand detection for contextual project sidebar
  const brandMatch = path.match(/^\/brands\/([^/?]+)/);
  const activeBrandId = brandMatch ? brandMatch[1] : null;
  const currentBrand = activeBrandId ? brands.find((b) => b.id === activeBrandId) : null;

  // Starred favorites
  const [favs, setFavs] = useState(favoriteIds);
  useEffect(() => setFavs(favoriteIds), [favoriteIds]);
  const setFav = (id: string, v: boolean) => {
    setFavs((f) => (v ? [...new Set([...f, id])] : f.filter((x) => x !== id)));
    start(async () => {
      try {
        await toggleFavorite(id, v);
      } catch {
        setFavs(favoriteIds);
      }
    });
  };

  // Section toggle states
  const [openFavs, setOpenFavs] = useState(true);
  const [openAllProjects, setOpenAllProjects] = useState(true);
  const [openCampaignsList, setOpenCampaignsList] = useState(true);
  const [openAdmin, setOpenAdmin] = useState(true);
  const [createBrandModalOpen, setCreateBrandModalOpen] = useState(false);
  const [campaignModalBrand, setCampaignModalBrand] = useState<BrandSidebarItem | null>(null);
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeBrandId) {
      setExpandedBrands((prev) => ({ ...prev, [activeBrandId]: true }));
    }
  }, [activeBrandId]);

  // New brand inline creation
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);

  const favoriteProjects = brands.filter((b) => favs.includes(b.id));

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-[#FAF9F5] border-r border-stone-200/90 text-slate-800 dark:bg-[#0B0E14] dark:border-[#2C3B53] dark:text-slate-200">
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="space-y-1">
          <div className="space-y-0.5">
            <NavRow href="/home" icon={Home} label="Studio Dashboard" active={path === "/home"} />
            <NavRow
              href="/my-tasks"
              icon={CheckCircle2}
              label="Assigned to me"
              count={myOpen}
              active={path === "/my-tasks"}
            />
            <NavRow
              href="/inbox"
              icon={Bell}
              label="Notifications"
              count={unread}
              badge
              active={path === "/inbox"}
            />
            {seeAll && (
              <NavRow
                href="/portfolios"
                icon={Briefcase}
                label="Plans & Roadmaps"
                active={path === "/portfolios"}
              />
            )}
            <NavRow href="/goals" icon={Target} label="Goals" active={path === "/goals"} />
            {seeAll && (
              <NavRow
                href="/projects"
                icon={LayoutList}
                label="All deliverables"
                active={path === "/projects"}
              />
            )}
            <NavRow
              href="/analytics"
              icon={BarChart3}
              label="Analytics & Reports"
              active={path === "/analytics"}
            />
          </div>

          {/* Starred Brands */}
          <SectionLabel
            title="Starred Brands"
            open={openFavs}
            onToggle={() => setOpenFavs((o) => !o)}
          />
          {openFavs && (
            <div className="space-y-0.5">
              {favoriteProjects.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-slate-400">
                  Star a brand to pin it here.
                </p>
              ) : (
                favoriteProjects.map((b) => (
                  <Link
                    key={b.id}
                    href={`/brands/${b.id}`}
                    className={cn(
                      "h-8 px-2.5 rounded-md flex items-center gap-2 text-[12.5px] font-medium transition-colors",
                      path === `/brands/${b.id}`
                        ? "bg-slate-200/70 font-semibold text-slate-950 dark:bg-white/10 dark:text-white"
                        : "text-slate-700 hover:bg-slate-200/40 dark:text-slate-300 dark:hover:bg-white/5"
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: b.color }}
                    />
                    <span className="truncate">{b.name}</span>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Saved Filters */}
          <SectionLabel title="Filters" />
          <div className="space-y-0.5">
            {SAVED_SEARCHES.filter((s) => seeAll || !s.adminOnly).map((s) => (
              <NavRow
                key={s.key}
                href={`/search?preset=${s.key}`}
                icon={s.icon}
                label={s.label}
                active={false}
              />
            ))}
          </div>

          {/* Brands & Campaigns */}
          <SectionLabel
            title="Brands"
            open={openAllProjects}
            onToggle={() => setOpenAllProjects((o) => !o)}
            action={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateBrandModalOpen(true);
                }}
                className="size-5 rounded border border-stone-300 dark:border-stone-700 hover:border-slate-900 dark:hover:border-white text-slate-500 hover:text-slate-950 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                title="Create / Add Brand"
              >
                <Plus className="size-3" strokeWidth={2.2} />
              </button>
            }
          />
          {openAllProjects && (
            <div className="space-y-0.5">
              {addingBrand && (
                <form
                  className="px-2 pb-2 pt-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newBrandName.trim()) return;
                    setAddErr(null);
                    start(async () => {
                      try {
                        const { id } = await createProject({ name: newBrandName });
                        setNewBrandName("");
                        setAddingBrand(false);
                        router.push(`/brands/${id}`);
                      } catch (err) {
                        setAddErr(err instanceof Error ? err.message : "Couldn't create brand");
                      }
                    });
                  }}
                >
                  <input
                    autoFocus
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Brand name"
                    className="w-full rounded-md border border-[#FFE600] bg-white px-2 py-1 text-[12px] text-slate-900 outline-none shadow-2xs dark:bg-[#161B22] dark:text-white"
                  />
                  {addErr && <p className="mt-1 text-[11px] text-rose-500">{addErr}</p>}
                </form>
              )}

              {brands.map((b) => {
                const isBrandActive = path === `/brands/${b.id}` && !currentCampaignId;
                const isExpanded = expandedBrands[b.id] ?? (b.id === activeBrandId);
                const hasCampaigns = (b.campaigns?.length ?? 0) > 0;

                return (
                  <div key={b.id} className="space-y-0.5">
                    <div className="flex items-center group/brand rounded-md">
                      <Link
                        href={`/brands/${b.id}`}
                        className={cn(
                          "h-8 flex-1 px-2.5 rounded-md flex items-center gap-2 text-[12.5px] font-medium transition-colors min-w-0",
                          isBrandActive
                            ? "bg-slate-200/70 font-semibold text-slate-950 dark:bg-white/10 dark:text-white shadow-2xs"
                            : "text-slate-700 hover:bg-slate-200/40 dark:text-slate-300 dark:hover:bg-white/5"
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: b.color }}
                        />
                        <span className="truncate flex-1">{b.name}</span>
                        {!hasCampaigns && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            0
                          </span>
                        )}
                      </Link>
                      {(admin || seeAll) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCampaignModalBrand(b);
                          }}
                          className="opacity-0 group-hover/brand:opacity-100 size-6 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0 transition-opacity cursor-pointer"
                          title={`Add campaign to ${b.name}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      )}
                      {hasCampaigns && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExpandedBrands((prev) => ({ ...prev, [b.id]: !isExpanded }));
                          }}
                          className="size-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded shrink-0 transition-colors cursor-pointer"
                          title={isExpanded ? "Collapse campaigns" : "Expand campaigns"}
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform duration-150",
                              !isExpanded && "-rotate-90"
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {/* Indented child campaigns (matching Screenshot 1) */}
                    {isExpanded && (
                      <div className="pl-3.5 pr-1 space-y-0.5 border-l border-stone-200/70 dark:border-stone-800 ml-3.5 my-0.5">
                        {hasCampaigns &&
                          b.campaigns!.map((c) => {
                            const isCampActive = path === `/brands/${b.id}` && currentCampaignId === c.id;
                            return (
                              <Link
                                key={c.id}
                                href={`/brands/${b.id}?campaign=${c.id}`}
                                className={cn(
                                  "h-7 px-2.5 rounded-md flex items-center gap-2 text-[12px] font-medium transition-colors",
                                  isCampActive
                                    ? "bg-[#5B3FD1]/15 text-[#5B3FD1] font-semibold dark:bg-[#5B3FD1]/30 dark:text-purple-300 shadow-2xs"
                                    : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                                )}
                              >
                                <span className="size-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                                <span className="truncate">{c.name}</span>
                              </Link>
                            );
                          })}
                        {(admin || seeAll) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCampaignModalBrand(b);
                            }}
                            className="h-6 w-full px-2 rounded-md flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                          >
                            <Plus className="size-3" />
                            <span>Add campaign</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Administration */}
          {(admin || seeAll) && (
            <>
              <SectionLabel
                title="Manage"
                open={openAdmin}
                onToggle={() => setOpenAdmin((o) => !o)}
              />
              {openAdmin && (
                <div className="space-y-0.5">
                  {admin && <NavRow href="/team" icon={Users} label="Team members" active={path === "/team"} />}
                  {admin && <NavRow href="/brands" icon={Tags} label="Brands registry" active={path === "/brands"} />}
                  {admin && <NavRow href="/automations" icon={Zap} label="Automations" active={path === "/automations"} />}
                  {seeAll && <NavRow href="/archive" icon={CheckCheck} label="Completed archive" active={path === "/archive"} />}
                </div>
              )}
            </>
          )}

          {/* Quick Help & Invite */}
          <div className="pt-2 border-t border-stone-200/70 dark:border-[#2C3B53]/70 space-y-0.5">
            <NavRow
              href="/team"
              icon={UserPlus}
              label="Invite teammates"
              active={false}
            />
            <NavRow
              href="/automations"
              icon={CircleHelp}
              label="Help & getting started"
              active={false}
            />
          </div>
        </div>
      </nav>

      {/* Footer User Row */}
      <div className="border-t border-stone-200/90 px-3 py-2.5 dark:border-[#2C3B53]">
        <div className="flex items-center gap-2">
          <Avatar name={name} size={26} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">{name}</div>
            <div className="truncate text-[10.5px] text-slate-500 font-mono" title={email}>
              {ROLE_LABEL[role] ?? role}
            </div>
          </div>
          <ThemeToggle />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded p-1 text-slate-400 hover:text-rose-600 transition-colors"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>

      {/* Create / Add Brand Modal */}
      <CreateBrandModal
        isOpen={createBrandModalOpen}
        onClose={() => setCreateBrandModalOpen(false)}
      />

      {/* Create / Add Campaign Modal */}
      {campaignModalBrand && (
        <CreateCampaignModal
          isOpen={!!campaignModalBrand}
          onClose={() => setCampaignModalBrand(null)}
          brandId={campaignModalBrand.id}
          brandName={campaignModalBrand.name}
          brands={brands.map((b) => ({ id: b.id, name: b.name }))}
          onCreated={(c) => {
            router.refresh();
            router.push(`/brands/${c.brandId}?campaign=${c.id}`);
          }}
        />
      )}
    </aside>
  );
}
