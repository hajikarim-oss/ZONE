import { notFound } from "next/navigation";
import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import FavoriteButton from "@/components/tasks/FavoriteButton";
import WorkspaceMembers from "@/components/tasks/WorkspaceMembers";
import BrandHeaderDetails from "@/components/brands/BrandHeaderDetails";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";
import { loadWorkspace } from "@/lib/workspace";

// A brand workspace (like an Asana project): its board, list and calendar.
// Members see every task in it; everyone else sees only their own tasks here.
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireTeamPage();
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      campaigns: { select: { id: true, name: true, internalDeadline: true }, orderBy: { name: "asc" } },
      favoritedBy: { where: { id: me.id }, select: { id: true } },
    },
  });
  if (!brand) notFound();
  const data = await loadWorkspace(me, { brandId: id, archived: false });
  const seeAll = canSeeAll(me);
  const isMember = brand.members.some((m) => m.id === me.id);
  return (
    <Suspense>
      <TaskWorkspace
        title={brand.name}
        subtitle={
          brand.pocName
            ? `POC: ${brand.pocName}${brand.pocEmail ? ` · ${brand.pocEmail}` : ""}`
            : `${brand.campaigns.length} Campaign${brand.campaigns.length === 1 ? "" : "s"} · Creative Post-Production Hub`
        }
        accentColor={brand.color}
        mode="brand"
        fixedBrandId={brand.id}
        defaultGroupBy="board"
        headerExtra={
          <div className="flex items-center gap-2">
            <BrandHeaderDetails
              brandName={brand.name}
              repositoryUrl={brand.repositoryUrl}
              guidelines={brand.guidelines}
            />
            <FavoriteButton brandId={brand.id} initial={brand.favoritedBy.length > 0} />
            <WorkspaceMembers
              brandId={brand.id}
              members={brand.members}
              people={data.people}
              meId={me.id}
              canAdd={seeAll || isMember}
              canRemoveOthers={seeAll}
            />
          </div>
        }
        {...data}
      />
    </Suspense>
  );
}
