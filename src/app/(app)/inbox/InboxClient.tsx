"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Calendar, Check, CheckCheck, Clock, ExternalLink, Flame, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { Page, PageTopbar, StatStrip, Stat, SectionBar } from "@/components/layout/Page";
import { markAllNotificationsRead } from "@/lib/actions";
import { cn, fmtDateTime } from "@/lib/utils";

type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

type Filter = "all" | "unread" | "critical" | "deadlines" | "assignments";

function getNotificationCategory(title: string, body: string | null) {
  const text = `${title} ${body || ""}`.toLowerCase();
  if (text.includes("founder") || text.includes("overdue (+24h)") || text.includes("overdue 24h")) {
    return {
      type: "founder",
      badge: "FOUNDER ESCALATION",
      cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
      icon: ShieldAlert,
    };
  }
  if (text.includes("critical") || text.includes("2h") || text.includes("2 hours")) {
    return {
      type: "critical_2h",
      badge: "2H CRITICAL",
      cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
      icon: Flame,
    };
  }
  if (text.includes("urgent") || text.includes("10h") || text.includes("10 hours")) {
    return {
      type: "urgent_10h",
      badge: "10H URGENT",
      cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60",
      icon: Clock,
    };
  }
  if (text.includes("24h") || text.includes("tomorrow")) {
    return {
      type: "warning_24h",
      badge: "24H WARNING",
      cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
      icon: Clock,
    };
  }
  if (text.includes("revised") || text.includes("extension")) {
    return {
      type: "timeline",
      badge: "TIMELINE REVISED",
      cls: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60",
      icon: Calendar,
    };
  }
  if (text.includes("assigned") || text.includes("new task")) {
    return {
      type: "assignment",
      badge: "ASSIGNMENT",
      cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
      icon: UserCheck,
    };
  }
  return {
    type: "general",
    badge: "STUDIO UPDATE",
    cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10",
    icon: Bell,
  };
}

export default function InboxClient({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();

  const unreadCount = items.filter((i) => !i.read).length;
  const criticalCount = items.filter((i) => {
    const cat = getNotificationCategory(i.title, i.body);
    return cat.type === "founder" || cat.type === "critical_2h";
  }).length;
  const deadlineCount = items.filter((i) => {
    const cat = getNotificationCategory(i.title, i.body);
    return cat.type === "warning_24h" || cat.type === "urgent_10h";
  }).length;

  const filtered = items.filter((i) => {
    if (filter === "unread") return !i.read;
    const cat = getNotificationCategory(i.title, i.body);
    if (filter === "critical") return cat.type === "founder" || cat.type === "critical_2h";
    if (filter === "deadlines") return cat.type === "warning_24h" || cat.type === "urgent_10h";
    if (filter === "assignments") return cat.type === "assignment";
    return true;
  });

  function markAllRead() {
    start(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    });
  }

  return (
    <Page className="h-full">
      <PageTopbar
        eyebrow="Notification Center"
        subtitle="Studio alerts, 3-tier deadline countdowns & founder escalations"
      >
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={pending}
            className="h-7 px-3 rounded-md border border-stone-300 bg-white hover:bg-slate-50 text-[12px] font-semibold text-slate-700 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
          >
            <CheckCheck className="size-3.5 text-blue-600 dark:text-blue-400" />
            <span>{pending ? "Marking..." : "Mark all as read"}</span>
          </button>
        )}
      </PageTopbar>

      {/* Dense Metric StatStrip */}
      <StatStrip cols={4}>
        <Stat label="Total Notifications" value={items.length} sub="Last 100 studio logs" />
        <Stat label="Unread" value={unreadCount} tone={unreadCount > 0 ? "blue" : undefined} />
        <Stat label="Deadline Alerts (24h / 10h)" value={deadlineCount} tone="amber" />
        <Stat
          label="Critical & Founder Escalations"
          value={criticalCount}
          tone={criticalCount > 0 ? "red" : undefined}
          accent={criticalCount > 0}
          last
        />
      </StatStrip>

      {/* Section Filter Bar */}
      <SectionBar label="FILTERS" count={`${filtered.length} shown`}>
        <div className="flex items-center gap-1 flex-wrap">
          {([
            ["all", "All Alerts"],
            ["unread", `Unread (${unreadCount})`],
            ["critical", `🚨 Critical & Founders (${criticalCount})`],
            ["deadlines", `⏳ Countdowns (24h/10h)`],
            ["assignments", `📌 Assignments`],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f as Filter)}
              className={cn(
                "h-6 px-2.5 rounded text-[11px] font-semibold border transition cursor-pointer shrink-0",
                filter === f
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950 shadow-2xs"
                  : "bg-white text-slate-700 border-stone-200 hover:bg-slate-50 dark:bg-[#161B22] dark:border-[#2C3B53] dark:text-slate-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </SectionBar>

      {/* Notifications List */}
      <div className="scroll-thin flex-1 overflow-y-auto p-4 md:p-6 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-[13px] text-muted">
            No notifications match this filter. You're completely caught up!
          </div>
        ) : (
          filtered.map((n) => {
            const cat = getNotificationCategory(n.title, n.body);
            const Icon = cat.icon;

            return (
              <div
                key={n.id}
                className={cn(
                  "rounded-lg border p-3.5 transition-all flex items-start gap-3.5",
                  !n.read
                    ? "bg-white dark:bg-[#161B22] border-blue-200 dark:border-blue-900/60 shadow-xs"
                    : "bg-stone-50/60 dark:bg-[#0B0E14]/40 border-stone-200/80 dark:border-[#2C3B53]/60 opacity-90 hover:opacity-100"
                )}
              >
                {/* Status Dot */}
                <span
                  className={cn(
                    "mt-1 size-2 rounded-full shrink-0",
                    !n.read ? "bg-blue-600 dark:bg-blue-400" : "bg-transparent"
                  )}
                />

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        cat.cls
                      )}
                    >
                      <Icon className="size-3" />
                      <span>{cat.badge}</span>
                    </span>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {fmtDateTime(n.createdAt)}
                    </span>
                  </div>

                  <h3 className={cn("text-[13.5px] text-slate-900 dark:text-white", !n.read ? "font-bold" : "font-medium")}>
                    {n.title}
                  </h3>

                  {n.body && (
                    <p className="text-[12.5px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {n.body}
                    </p>
                  )}
                </div>

                {/* Direct Action Link */}
                {n.href && (
                  <Link
                    href={`/api/notifications/${n.id}/open`}
                    prefetch={false}
                    className="h-7 px-3 rounded-md bg-[#0052CC] hover:bg-[#0747A6] text-white text-[11.5px] font-bold inline-flex items-center gap-1.5 transition shadow-xs shrink-0 self-center cursor-pointer whitespace-nowrap"
                  >
                    <span>View Task</span>
                    <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </Page>
  );
}

