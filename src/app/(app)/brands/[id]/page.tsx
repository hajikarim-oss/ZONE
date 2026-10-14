import { notFound } from "next/navigation";
import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadWorkspace } from "@/lib/workspace";

// One brand's projects (old per-brand sheet, internal view).
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireTeamPage();
  const brand = await prisma.brand.findUnique({ where: { id } });
  if (!brand) notFound();
  const data = await loadWorkspace(me, { brandId: id, archived: false });
  return (
    <Suspense>
      <TaskWorkspace
        title={brand.name}
        subtitle={brand.pocName ? `POC: ${brand.pocName}${brand.pocEmail ? ` · ${brand.pocEmail}` : ""}` : undefined}
        accentColor={brand.color}
        mode="brand"
        fixedBrandId={brand.id}
        defaultGroupBy="stage"
        {...data}
      />
    </Suspense>
  );
}
