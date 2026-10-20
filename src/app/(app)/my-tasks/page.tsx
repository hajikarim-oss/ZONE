import { Suspense } from "react";
import CalendarLink from "@/components/tasks/CalendarLink";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { calendarFeedUrl } from "@/lib/feeds";
import { requireTeamPage } from "@/lib/auth";
import { loadWorkspace } from "@/lib/workspace";
import { myTasksFilter } from "@/lib/rbac";

// Replaces each person's tab in the old TEAM sheet.
export default async function MyTasksPage() {
  const me = await requireTeamPage();
  // Like Asana: tasks assigned to me, tasks I added, and tasks I collaborate on
  const data = await loadWorkspace(me, { archived: false, ...myTasksFilter(me.id) });
  return (
    <Suspense>
      <TaskWorkspace
        title="My tasks"
        subtitle={`Tasks assigned to you (or a subtask of yours), tasks you added, and tasks you collaborate on, ${me.name.split(" ")[0]}. Add your own with "Add task".`}
        mode="mine"
        defaultGroupBy="board"
        headerExtra={<CalendarLink url={calendarFeedUrl(me.id)} />}
        {...data}
      />
    </Suspense>
  );
}
