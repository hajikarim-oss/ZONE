import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Tour from "@/components/Tour";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll, isAdmin, myTasksFilter } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);

  const [unread, brands, myOpen, favorites, team, teamCount, allPeople] = await Promise.all([
    prisma.notification.count({ where: { userId: me.id, read: false } }),
    seeAll
      ? prisma.brand.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            color: true,
            campaigns: { orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
        })
      : prisma.brand.findMany({
          // Brand workspaces they're a member of, plus brands of their own tasks
          where: { OR: [{ members: { some: { id: me.id } } }, { projects: { some: { archived: false, ...myTasksFilter(me.id) } } }] },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            color: true,
            campaigns: { orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
        }),
    prisma.project.count({
      where: { assigneeId: me.id, archived: false, deliveryStatus: { notIn: ["Files Sent", "Invoice Raised", "Project Closed"] } },
    }),
    prisma.brand.findMany({ where: { favoritedBy: { some: { id: me.id } } }, select: { id: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, name: true } }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, department: true, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#FAF9F5] dark:bg-[#0B0E14] overflow-hidden">
      <Suspense>
        <TopBar
          name={me.name}
          email={me.email}
          role={me.role}
          unreadCount={unread}
          brands={brands as any}
          people={allPeople as any}
        />
      </Suspense>

      <div className="flex-1 flex min-h-0">
        <Suspense fallback={<div className="hidden w-64 border-r border-stone-200/90 bg-[#FAF9F5] md:block" />}>
          <Sidebar
            name={me.name}
            email={me.email}
            role={me.role}
            seeAll={seeAll}
            admin={isAdmin(me)}
            unread={unread}
            myOpen={myOpen}
            brands={brands}
            favoriteIds={favorites.map((f) => f.id)}
            team={team}
            teamCount={teamCount}
          />
        </Suspense>

        <main className="flex-1 min-w-0 bg-white overflow-hidden border-t border-stone-200/90 md:rounded-tl-2xl md:border-l dark:bg-[#0F141C] dark:border-[#2C3B53] flex flex-col shadow-xs">
          <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        </main>
      </div>

      <Tour userId={me.id} name={me.name} role={me.role} />
    </div>
  );
}
