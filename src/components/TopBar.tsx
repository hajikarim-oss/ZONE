"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { CircleHelp, LogOut, Plus, Search, User } from "lucide-react";
import Avatar from "@/components/Avatar";
import { ROLE_LABEL } from "@/lib/constants";

// Asana-style top bar (laptop): search, quick add, profile menu.
export default function TopBar({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(path === "/search" ? params.get("q") ?? "" : "");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, like Asana
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="hidden h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:flex">
      <form
        className="relative ml-auto w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, brands, subtasks  ( / )"
          className="w-full rounded-full border border-line bg-canvas py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-accent focus:bg-surface"
        />
      </form>
      <Link href="/my-tasks?new=1" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white hover:opacity-90" title="Add task">
        <Plus className="h-4 w-4" />
      </Link>
      <div ref={menuRef} className="relative">
        <button onClick={() => setMenu((m) => !m)} className="rounded-full" title={name}>
          <Avatar name={name} size={30} />
        </button>
        {menu && (
          <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-lg border border-line bg-surface py-1 text-[13px] shadow-pop">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Avatar name={name} size={28} />
              <div className="min-w-0">
                <div className="truncate font-medium">{name}</div>
                <div className="truncate text-[11px] text-muted">{email} · {ROLE_LABEL[role] ?? role}</div>
              </div>
            </div>
            <Link href="/my-tasks" className="flex items-center gap-2 px-3 py-1.5 hover:bg-canvas" onClick={() => setMenu(false)}>
              <User className="h-4 w-4" /> My tasks
            </Link>
            <Link href="/guide" className="flex items-center gap-2 px-3 py-1.5 hover:bg-canvas" onClick={() => setMenu(false)}>
              <CircleHelp className="h-4 w-4" /> Help &amp; getting started
            </Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
