import type { Prisma, User } from "@prisma/client";
import type { GoalDTO, StorageDTO } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { forViewer, taskInclude, toBrands, toPeople, toTaskDTO } from "@/lib/dto";
import { canSeeAll, canSeeFinancials, isAdmin, visibleToMember } from "@/lib/rbac";

// Data every task view needs: the tasks, plus people/brands/goals/storages for dropdowns.
export async function loadWorkspace(me: User & { brandIds: string[] }, where: Prisma.ProjectWhereInput) {
  const scoped: Prisma.ProjectWhereInput = canSeeAll(me) ? where : { AND: [where, visibleToMember(me.id)] };
  const [tasks, people, brands, storages, goals] = await Promise.all([
    prisma.project.findMany({ where: scoped, include: taskInclude, orderBy: { code: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, include: { campaigns: { orderBy: { name: "asc" } } } }),
    prisma.storage.findMany({
      orderBy: { name: "asc" },
      include: {
        entries: { orderBy: { createdAt: "desc" } },
        _count: { select: { projects: true, entries: true } },
      },
    }),
    prisma.goal.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, brandId: true, ownerId: true, status: true, progress: true },
    }),
  ]);
  return {
    tasks: tasks.map((t) => forViewer(toTaskDTO(t), canSeeAll(me))),
    people: toPeople(people),
    brands: toBrands(brands),
    storages: storages.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      location: s.location,
      capacity: s.capacity,
      notes: s.notes,
      projectsCount: s._count.projects,
      entriesCount: s._count.entries,
      entries: s.entries.map((e) => ({
        id: e.id,
        storageId: e.storageId,
        storageName: s.name,
        taskName: e.taskName,
        folderPath: e.folderPath,
        status: e.status || "Completed",
        reviewer: e.reviewer,
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      })),
    })) as StorageDTO[],
    goals: goals as GoalDTO[],
    viewer: {
      id: me.id,
      email: me.email,
      role: me.role,
      seeAll: canSeeAll(me),
      admin: isAdmin(me),
      canSeeFinancials: canSeeFinancials(me),
      department: me.department,
      brandIds: me.brandIds,
    },
  };
}
