import { redirect } from "next/navigation";
import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { requireTeamPage } from "@/lib/auth";
import { canSeeAll } from "@/lib/rbac";
import { loadWorkspace } from "@/lib/workspace";

// Replaces the Master sheet's PROJECTS tab.
export default async function ProjectsPage() {
  const me = await requireTeamPage();
  if (!canSeeAll(me)) redirect("/my-tasks");
  const data = await loadWorkspace(me, { archived: false });
  return (
    <Suspense>
      <TaskWorkspace title="All projects" subtitle="Every brand, every deliverable" mode="all" defaultGroupBy="brand" {...data} />
    </Suspense>
  );
}
