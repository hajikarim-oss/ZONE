"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Bell, CheckCheck, CheckCircle2, CircleHelp, Home, LayoutList, LogOut, Tags, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ROLE_LABEL } from "@/lib/constants";

type Props = {
  name: string;
  email: string;
  role: string;
  seeAll: boolean;
  admin: boolean;
  unread: number;
  myOpen: number;
  brands: { id: string; name: string; color: string }[];
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

function Label({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wide text-side-muted">{children}</div>;
}

export default function Sidebar({ name, email, role, seeAll, admin, unread, myOpen, brands }: Props) {
  const path = usePathname();
  const on = (p: string) => path === p || path.startsWith(p + "/");

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

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-side text-side-fg">
      <Link href="/home" className="block px-4 pb-4 pt-5">
        <Logo className="h-auto w-[176px]" />
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-side-muted">Post Prod Panel</div>
      </Link>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <Item href="/home" icon={Home} label="Home" tour="nav-home" active={on("/home")} />
        <Item href="/my-tasks" icon={CheckCircle2} label="My tasks" tour="nav-mytasks" count={myOpen} active={on("/my-tasks")} />
        <Item href="/inbox" icon={Bell} label="Notifications" tour="nav-notifications" count={unreadLive} badge active={on("/inbox")} />
        {seeAll && <Item href="/projects" icon={LayoutList} label="All projects" tour="nav-projects" active={on("/projects")} />}

        <div data-tour="nav-brands">
        <Label>Brands</Label>
        {brands.length === 0 && <p className="px-2.5 text-xs text-side-muted">No brands yet</p>}
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/brands/${b.id}`}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              path === `/brands/${b.id}` ? "bg-side-active font-medium text-side-fg" : "text-side-fg/80 hover:bg-side-hover hover:text-side-fg",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: b.color }} />
            <span className="truncate">{b.name}</span>
          </Link>
        ))}
        </div>

        {(admin || seeAll) && <Label>Manage</Label>}
        {admin && <Item href="/team" icon={Users} label="Team" tour="nav-team" active={on("/team")} />}
        {admin && <Item href="/brands" icon={Tags} label="Brands & clients" tour="nav-brandsadmin" active={path === "/brands"} />}
        {admin && <Item href="/automations" icon={Zap} label="Automations" tour="nav-automations" active={on("/automations")} />}
        {seeAll && <Item href="/archive" icon={CheckCheck} label="Completed" tour="nav-completed" active={on("/archive")} />}

        <div className="pt-4" />
        <Item href="/guide" icon={CircleHelp} label="Help & tour" tour="nav-help" active={on("/guide")} />
      </nav>

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
  );
}
