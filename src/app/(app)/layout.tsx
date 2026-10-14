import Sidebar from "@/components/Sidebar";
import Tour from "@/components/Tour";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll, isAdmin } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);

  const [unread, brands, myOpen] = await Promise.all([
    prisma.notification.count({ where: { userId: me.id, read: false } }),
    seeAll
      ? prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } })
      : prisma.brand.findMany({
          where: { projects: { some: { assigneeId: me.id, archived: false } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        }),
    prisma.project.count({
      where: { assigneeId: me.id, archived: false, deliveryStatus: { notIn: ["Files Sent", "Invoice Raised", "Project Closed"] } },
    }),
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
      />
      <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-surface pt-14 md:pt-0">{children}</main>
      <Tour userId={me.id} name={me.name} role={me.role} />
    </div>
  );
}
