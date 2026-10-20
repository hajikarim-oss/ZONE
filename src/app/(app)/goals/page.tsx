import GoalsClient from "./goals-client";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";

// Goals (like Asana Goals): what the team is working towards.
export default async function GoalsPage() {
  const me = await requireTeamPage();
  const [goals, people, brands] = await Promise.all([
    prisma.goal.findMany({ orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], include: { owner: { select: { name: true } }, brand: { select: { name: true, color: true } } } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <GoalsClient
      meId={me.id}
      canManage={canSeeAll(me)}
      people={people}
      brands={brands}
      goals={goals.map((g) => ({
        id: g.id,
        title: g.title,
        ownerId: g.ownerId,
        ownerName: g.owner?.name ?? null,
        brandName: g.brand?.name ?? null,
        brandColor: g.brand?.color ?? null,
        dueDate: g.dueDate?.toISOString() ?? null,
        progress: g.progress,
        status: g.status,
        notes: g.notes,
      }))}
    />
  );
}
