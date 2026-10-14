import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { requireTeamPage } from "@/lib/auth";
import { loadWorkspace } from "@/lib/workspace";

// Replaces each person's tab in the old TEAM sheet.
export default async function MyTasksPage() {
  const me = await requireTeamPage();
  const data = await loadWorkspace(me, { assigneeId: me.id, archived: false });
  return (
    <Suspense>
      <TaskWorkspace
        title="My tasks"
        subtitle={`Everything assigned to you, ${me.name.split(" ")[0]}. Update the status and post your notes or links; it all syncs to the team.`}
        mode="mine"
        defaultGroupBy="stage"
        {...data}
      />
    </Suspense>
  );
}
