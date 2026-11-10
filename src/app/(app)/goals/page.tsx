import GoalsClient from "./goals-client";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";
import { isDone } from "@/lib/status";

// Goals (Point 2): Project/Campaign goals + Individual member goals with automatic task-based progress tracking.
export default async function GoalsPage() {
  const me = await requireTeamPage();
  const [goals, people, brands, projects] = await Promise.all([
    prisma.goal.findMany({
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        owner: { select: { name: true } },
        brand: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, campaigns: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { archived: false },
      select: {
        id: true,
        brandId: true,
        assigneeId: true,
        editStatus: true,
        deliveryStatus: true,
        internalDeadline: true,
        closedAt: true,
        revisionRound: true,
      },
    }),
  ]);

  return (
    <GoalsClient
      meId={me.id}
      canManage={canSeeAll(me)}
      people={people}
      brands={brands}
      goals={goals.map((g) => {
        // Automatic task progress calculation from linked brand and/or individual owner
        const linkedTasks = projects.filter((p) => {
          if (g.brandId && p.brandId !== g.brandId) return false;
          if (g.ownerId && g.brandId && p.assigneeId !== g.ownerId) return false;
          if (g.ownerId && !g.brandId && p.assigneeId !== g.ownerId) return false;
          return true;
        });
        const totalTasks = linkedTasks.length;
        const doneTasks = linkedTasks.filter(
          (p) =>
            p.deliveryStatus === "Project Closed" ||
            p.editStatus === "Completed" ||
            p.editStatus === "Delivered" ||
            p.closedAt !== null
        ).length;
        const autoProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : g.progress;

        return {
          id: g.id,
          title: g.title,
          ownerId: g.ownerId,
          ownerName: g.owner?.name ?? null,
          brandId: g.brandId,
          brandName: g.brand?.name ?? null,
          brandColor: g.brand?.color ?? null,
          dueDate: g.dueDate?.toISOString() ?? null,
          progress: g.progress,
          autoProgress,
          linkedTotalTasks: totalTasks,
          linkedDoneTasks: doneTasks,
          status: g.status,
          notes: g.notes,
        };
      })}
    />
  );
}
