import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forViewer, taskInclude, toBrands, toPeople, toTaskDTO } from "@/lib/dto";
import { canSeeAll, isAdmin, visibleToMember } from "@/lib/rbac";

// Data every task view needs: the tasks, plus people/brands for dropdowns.
export async function loadWorkspace(me: User, where: Prisma.ProjectWhereInput) {
  // Brand workspaces are open to all team members: "Anyone can view, add teammates, and create their own projects within their workspace"
  const isBrandWorkspace = Boolean(where.brandId);
  const scoped: Prisma.ProjectWhereInput = (canSeeAll(me) || isBrandWorkspace) ? where : { AND: [where, visibleToMember(me.id)] };
  const [tasks, people, brands] = await Promise.all([
    prisma.project.findMany({ where: scoped, include: taskInclude, orderBy: { code: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    tasks: tasks.map((t) => forViewer(toTaskDTO(t), canSeeAll(me))),
    people: toPeople(people),
    brands: toBrands(brands),
    viewer: { id: me.id, role: me.role, seeAll: canSeeAll(me), admin: isAdmin(me), department: me.department },
  };
}
