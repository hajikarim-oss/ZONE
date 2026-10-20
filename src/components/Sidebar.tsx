"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import {
  Bell, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Copy, Home, LayoutList, LogOut, Menu,
  MoreHorizontal, Plus, Search, Star, Tags, Target, Briefcase, UserPlus, Users, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ROLE_LABEL } from "@/lib/constants";
import { createProject, toggleFavorite } from "@/lib/actions";
import { SAVED_SEARCHES } from "@/lib/saved-searches";

type Project = { id: string; name: string; color: string };
type Props = {
  name: string;
  email: string;
  role: string;
  seeAll: boolean;
  admin: boolean;
  unread: number;
  myOpen: number;
  brands: Project[];
  favoriteIds: string[];
  team: { id: string; name: string }[];
  teamCount: number;
};

function Item({ href, icon: Icon, label, count, badge, active, tour }: { href: string; icon: any; label: string; count?: number; badge?: boolean; active: boolean; tour?: string }) {
  return (
    <Link
      href={href}
      data-tour={tour}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active ? "bg-side-active font-medium text-side-fg" : "text-side-fg/80 hover:bg-side-hover hover:text-side-fg",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span className="flex-1 truncate">{label}</span>
      {!!count &&
        (badge ? (
          <span className="min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold text-white">{count > 99 ? "99+" : count}</span>
        ) : (
          <span className="text-[11px] text-side-muted">{count}</span>
        ))}
    </Link>
  );
}

// Collapsible section header (Favorites, Saved searches…), remembered per browser
function Section({ id, title, action, children, defaultOpen = true }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`side:${id}`);
      if (v !== null) setOpen(v === "1");
    } catch {}
  }, [id]);
  return (
    <div className="pt-3">
      <div className="group flex items-center px-2.5 pb-1">
        <button
          onClick={() => {
            setOpen((o) => {
              try { localStorage.setItem(`side:${id}`, o ? "0" : "1"); } catch {}
              return !o;
            });
          }}
          className="flex flex-1 items-center gap-1 text-left text-[12px] font-medium text-side-muted hover:text-side-fg"
        >
          {title}
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {action}
      </div>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function ProjectLink({ p, active, favorite, admin, onToggleFav }: { p: Project; active: boolean; favorite: boolean; admin: boolean; onToggleFav: (on: boolean) => void }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  return (
    <div ref={ref} className="group relative">
      <Link
        href={`/brands/${p.id}`}
        className={cn(
          "flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-8 text-[13px] transition-colors",
          active ? "bg-side-active font-medium text-side-fg" : "text-side-fg/80 hover:bg-side-hover hover:text-side-fg",
        )}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
        <span className="truncate">{p.name}</span>
      </Link>
      <button
        onClick={() => setMenu((m) => !m)}
        className={cn("absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-side-muted hover:bg-side-hover hover:text-side-fg", menu ? "block" : "hidden group-hover:block")}
        title="Project actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu && (
        <div className="absolute left-full top-0 z-50 ml-1 w-52 rounded-lg border border-line bg-surface py-1 text-[13px] text-ink shadow-pop">
          <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-canvas" onClick={() => { onToggleFav(!favorite); setMenu(false); }}>
            <Star className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")} />
            {favorite ? "Remove from favorites" : "Add to favorites"}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-canvas"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/brands/${p.id}`);
                setCopied(true);
                setTimeout(() => { setCopied(false); setMenu(false); }, 900);
              } catch {}
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? "Link copied" : "Copy project link"}
          </button>
          {admin && (
            <Link href="/brands" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-canvas" onClick={() => setMenu(false)}>
              <Tags className="h-4 w-4" /> Edit project details
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ name, email, role, seeAll, admin, unread, myOpen, brands, favoriteIds, team, teamCount }: Props) {
  const path = usePathname();
  const router = useRouter();
  const on = (p: string) => path === p || path.startsWith(p + "/");
  const [, start] = useTransition();

  // Phone: slide-in drawer. Laptop: can be collapsed (☰), like Asana.
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("side:collapsed") === "1"); } catch {}
  }, []);
  const collapse = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem("side:collapsed", v ? "1" : "0"); } catch {}
  };

  // Favorites update instantly, then save
  const [favs, setFavs] = useState(favoriteIds);
  useEffect(() => setFavs(favoriteIds), [favoriteIds]);
  const setFav = (id: string, v: boolean) => {
    setFavs((f) => (v ? [...new Set([...f, id])] : f.filter((x) => x !== id)));
    start(async () => {
      try { await toggleFavorite(id, v); } catch { setFavs(favoriteIds); }
    });
  };

  // New project (+)
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);

  // Invite teammates (admins add people on the Team page)
  const [inviteInfo, setInviteInfo] = useState(false);

  // Live unread count: refreshes every 30s, when the tab regains focus and on navigation.
  const [unreadLive, setUnreadLive] = useState(unread);
  useEffect(() => setUnreadLive(unread), [unread]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications/unread", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && typeof d.count === "number" && setUnreadLive(d.count))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [path]);

  const favProjects = brands.filter((b) => favs.includes(b.id));
  const projectLink = (b: Project) => (
    <ProjectLink key={b.id} p={b} active={path === `/brands/${b.id}`} favorite={favs.includes(b.id)} admin={admin} onToggleFav={(v) => setFav(b.id, v)} />
  );

  return (
    <>
      {/* Phone top bar (hidden on laptop) */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-side px-3 md:hidden">
        <button onClick={() => setDrawer(true)} className="relative rounded-md p-2 text-side-fg hover:bg-side-hover" aria-label="Open menu">
          <Menu className="h-5 w-5" />
          {unreadLive > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
        </button>
        <Link href="/home" className="flex min-w-0 items-center gap-2">
          <Logo className="h-auto w-[120px]" />
        </Link>
        <Link href="/search" className="ml-auto rounded-md p-2 text-side-fg hover:bg-side-hover" aria-label="Search">
          <Search className="h-5 w-5" />
        </Link>
      </div>
      {drawer && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setDrawer(false)} />}

      {/* Laptop: reopen button when collapsed */}
      {collapsed && (
        <button
          onClick={() => collapse(false)}
          className="fixed left-3 top-3 z-40 hidden rounded-md border border-line bg-surface p-1.5 text-muted shadow-pop hover:text-ink md:block"
          title="Show sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <aside
        className={cn(
          "flex h-dvh w-72 shrink-0 flex-col border-r border-line bg-side text-side-fg md:w-60",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          drawer ? "translate-x-0 shadow-pop" : "-translate-x-full",
          collapsed && "md:hidden",
        )}
      >
        <button onClick={() => setDrawer(false)} className="absolute right-2 top-3 rounded-md p-2 text-side-muted hover:bg-side-hover md:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-start gap-2 px-4 pb-3 pt-5">
          <Link href="/home" className="block min-w-0 flex-1">
            <Logo className="h-auto w-[150px]" />
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-side-muted">Post Prod Panel</div>
          </Link>
          <button onClick={() => collapse(true)} className="hidden rounded-md p-1.5 text-side-muted hover:bg-side-hover hover:text-side-fg md:block" title="Hide sidebar">
            <Menu className="h-4 w-4" />
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-0.5">
            <Item href="/home" icon={Home} label="Home" tour="nav-home" active={on("/home")} />
            <Item href="/my-tasks" icon={CheckCircle2} label="My tasks" tour="nav-mytasks" count={myOpen} active={on("/my-tasks")} />
            <Item href="/inbox" icon={Bell} label="Inbox" tour="nav-notifications" count={unreadLive} badge active={on("/inbox")} />
            {seeAll && <Item href="/portfolios" icon={Briefcase} label="Portfolios" active={on("/portfolios")} />}
            <Item href="/goals" icon={Target} label="Goals" active={on("/goals")} />
            {seeAll && <Item href="/projects" icon={LayoutList} label="All projects" tour="nav-projects" active={on("/projects")} />}
          </div>

          <Section id="favorites" title="Favorites">
            {favProjects.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-side-muted">Star a project (⋯ → Add to favorites) to pin it here.</p>
            ) : (
              favProjects.map(projectLink)
            )}
          </Section>

          <Section id="saved" title="Saved searches" defaultOpen={false}>
            {SAVED_SEARCHES.filter((s) => seeAll || !s.adminOnly).map((s) => (
              <Item key={s.key} href={`/search?preset=${s.key}`} icon={s.icon} label={s.label} active={false} />
            ))}
          </Section>

          <div data-tour="nav-brands">
            <Section
              id="workspace"
              title="TBM Workspace"
              action={
                <button onClick={() => { setAdding((a) => !a); setAddErr(null); }} className="rounded p-0.5 text-side-muted hover:bg-side-hover hover:text-side-fg" title="New project">
                  <Plus className="h-4 w-4" />
                </button>
              }
            >
              {/* team avatars, like Asana */}
              <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-0.5">
                {team.slice(0, 5).map((m) => (
                  <span key={m.id} title={m.name}>
                    <Avatar name={m.name} size={24} />
                  </span>
                ))}
                {teamCount > 5 && <span className="pl-1 text-[11px] text-side-muted">+{teamCount - 5}</span>}
                {admin && (
                  <Link href="/team" className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-side-muted/60 text-side-muted hover:text-side-fg" title="Team">
                    <Users className="h-3 w-3" />
                  </Link>
                )}
              </div>

              {adding && (
                <form
                  className="px-2 pb-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAddErr(null);
                    start(async () => {
                      try {
                        const { id } = await createProject({ name: newName });
                        setNewName("");
                        setAdding(false);
                        router.push(`/brands/${id}`);
                      } catch (err) {
                        setAddErr(err instanceof Error ? err.message : "Couldn't create project");
                      }
                    });
                  }}
                >
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New project / brand name"
                    className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  {addErr && <p className="mt-1 text-[11px] text-rose-400">{addErr}</p>}
                  <p className="mt-1 text-[11px] text-side-muted">Enter to create. You&apos;ll be its first member.</p>
                </form>
              )}
              {brands.length === 0 && !adding && <p className="px-2.5 text-xs text-side-muted">No projects yet. Click + to add one.</p>}
              {brands.map(projectLink)}
            </Section>
          </div>

          {(admin || seeAll) && (
            <Section id="manage" title="Manage">
              {admin && <Item href="/team" icon={Users} label="Team" tour="nav-team" active={on("/team")} />}
              {admin && <Item href="/brands" icon={Tags} label="Brands & clients" tour="nav-brandsadmin" active={path === "/brands"} />}
              {admin && <Item href="/automations" icon={Zap} label="Automations" tour="nav-automations" active={on("/automations")} />}
              {seeAll && <Item href="/archive" icon={CheckCheck} label="Completed" tour="nav-completed" active={on("/archive")} />}
            </Section>
          )}
        </nav>

        <div className="space-y-0.5 border-t border-line px-2 py-2">
          {admin ? (
            <Item href="/team?invite=1" icon={UserPlus} label="Invite teammates" active={false} />
          ) : (
            <div className="relative">
              <button onClick={() => setInviteInfo((x) => !x)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-side-fg/80 hover:bg-side-hover hover:text-side-fg">
                <UserPlus className="h-4 w-4" strokeWidth={1.8} /> Invite teammates
              </button>
              {inviteInfo && (
                <p className="mx-2.5 mb-1 rounded-md bg-side-hover px-2 py-1.5 text-[11px] text-side-fg/80">
                  New people are added by an admin on the Team page. Ask an admin to invite them, then add them to your project from its members button.
                </p>
              )}
            </div>
          )}
          <Item href="/guide" icon={CircleHelp} label="Help & getting started" tour="nav-help" active={on("/guide")} />
        </div>

        <div className="flex items-center gap-2 border-t border-line px-3 py-3">
          <Avatar name={name} size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px]">{name}</div>
            <div className="truncate text-[11px] text-side-muted" title={email}>{ROLE_LABEL[role] ?? role}</div>
          </div>
          <span data-tour="theme"><ThemeToggle /></span>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-md p-1.5 text-side-muted hover:bg-side-hover hover:text-side-fg" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
