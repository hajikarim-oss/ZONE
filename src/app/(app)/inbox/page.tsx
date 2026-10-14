import Link from "next/link";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn, fmtDateTime } from "@/lib/utils";
import MarkReadButton from "./mark-read";

export default async function InboxPage() {
  const me = await requireTeamPage();
  const items = await prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">Notifications</h1>
          {unread > 0 && <MarkReadButton />}
        </div>
        <div className="rounded-lg border border-line">
          {items.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-muted">You're all caught up.</p>}
          {items.map((n) => {
            const body = (
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[13px]", !n.read && "font-semibold")}>{n.title}</div>
                  {n.body && <div className="text-[12px] text-muted">{n.body}</div>}
                </div>
                <div className="shrink-0 text-[11px] text-muted">{fmtDateTime(n.createdAt)}</div>
              </div>
            );
            return n.href ? (
              <Link key={n.id} href={`/api/notifications/${n.id}/open`} prefetch={false} className="block border-b border-line/70 last:border-0 hover:bg-canvas">{body}</Link>
            ) : (
              <div key={n.id} className="border-b border-line/70 last:border-0">{body}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
