import type { Prisma, User } from "@prisma/client";
import type { StorageDTO } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { forViewer, taskInclude, toBrands, toPeople, toTaskDTO } from "@/lib/dto";
import { canSeeAll, isAdmin, visibleToMember } from "@/lib/rbac";

// Data every task view needs: the tasks, plus people/brands for dropdowns.
export async function loadWorkspace(me: User & { brandIds: string[] }, where: Prisma.ProjectWhereInput) {
  const scoped: Prisma.ProjectWhereInput = canSeeAll(me) ? where : { AND: [where, visibleToMember(me.id)] };
  const [tasks, people, brands, storages] = await Promise.all([
    prisma.project.findMany({ where: scoped, include: taskInclude, orderBy: { code: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.storage.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    tasks: tasks.map((t) => forViewer(toTaskDTO(t), canSeeAll(me))),
    people: toPeople(people),
    brands: toBrands(brands),
    storages: storages as StorageDTO[],
    viewer: { id: me.id, role: me.role, seeAll: canSeeAll(me), admin: isAdmin(me), department: me.department, brandIds: me.brandIds },
  };
}
