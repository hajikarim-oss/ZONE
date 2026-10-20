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

  const [unread, brands, myOpen, favorites, team, teamCount] = await Promise.all([
    prisma.notification.count({ where: { userId: me.id, read: false } }),
    seeAll
      ? prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } })
      : prisma.brand.findMany({
          // Brand workspaces they're a member of, plus brands of their own tasks
          where: { OR: [{ members: { some: { id: me.id } } }, { projects: { some: { archived: false, ...myTasksFilter(me.id) } } }] },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        }),
    prisma.project.count({
      where: { assigneeId: me.id, archived: false, deliveryStatus: { notIn: ["Files Sent", "Invoice Raised", "Project Closed"] } },
    }),
    prisma.brand.findMany({ where: { favoritedBy: { some: { id: me.id } } }, select: { id: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, name: true } }),
    prisma.user.count({ where: { active: true } }),
  ]);

  return (
    <div className="flex h-dvh overflow-hidden">
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
      <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-surface pt-14 md:pt-0">
        <Suspense>
          <TopBar name={me.name} email={me.email} role={me.role} />
        </Suspense>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
      <Tour userId={me.id} name={me.name} role={me.role} />
    </div>
  );
}
