import { redirect } from "next/navigation";
import { Suspense } from "react";
import CalendarLink from "@/components/tasks/CalendarLink";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { calendarFeedUrl } from "@/lib/feeds";
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
      <TaskWorkspace
        title="All projects"
        subtitle="Every brand, every deliverable"
        mode="all"
        defaultGroupBy="brand"
        headerExtra={<CalendarLink url={calendarFeedUrl(me.id)} />}
        {...data}
      />
    </Suspense>
  );
}
