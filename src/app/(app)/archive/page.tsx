import { redirect } from "next/navigation";
import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { requireTeamPage } from "@/lib/auth";
import { canSeeAll } from "@/lib/rbac";
import { loadWorkspace } from "@/lib/workspace";

// Old ARCHIVE tab: closed projects move here automatically after 30 days.
export default async function ArchivePage() {
  const me = await requireTeamPage();
  if (!canSeeAll(me)) redirect("/my-tasks");
  const data = await loadWorkspace(me, { archived: true });
  return (
    <Suspense>
      <TaskWorkspace title="Completed" subtitle="Closed projects move here automatically 30 days after closing. Open one to move it back to active." mode="archive" defaultGroupBy="brand" {...data} />
    </Suspense>
  );
}
