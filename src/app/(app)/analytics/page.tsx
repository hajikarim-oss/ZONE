import { Suspense } from "react";
import Link from "next/link";
import { BarChart3, Layers, Kanban, Calendar } from "lucide-react";
import { Page, PageTopbar, TopbarAction, PageBody } from "@/components/layout/Page";
import ProjectDashboardView from "@/components/analytics/ProjectDashboardView";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll, myTasksFilter } from "@/lib/rbac";
import { forViewer, taskInclude, toPeople, toBrands, toTaskDTO } from "@/lib/dto";

export default async function AnalyticsPage() {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);

  const [rawProjects, rawBrands, rawPeople] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false, ...(seeAll ? {} : myTasksFilter(me.id)) },
      include: taskInclude,
      orderBy: { code: "asc" },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { campaigns: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    }),
  ]);

  const tasks = rawProjects.map((p) => forViewer(toTaskDTO(p), seeAll));
  const brands = toBrands(rawBrands);
  const people = toPeople(rawPeople);

  return (
    <Page>
      <PageTopbar
        eyebrow="Studio Analytics &amp; Operations Intelligence"
        subtitle="Real-time post-production burn-down, editor workload allocation, and delivery telemetry"
      >
        <div className="flex items-center gap-2">
          <TopbarAction variant="ghost" href="/home" icon={<Calendar className="size-3.5" />}>
            Day Timeline
          </TopbarAction>
          <TopbarAction variant="primary" href="/projects" icon={<Kanban className="size-3.5" />}>
            All Deliverables
          </TopbarAction>
        </div>
      </PageTopbar>

      <PageBody className="p-5 md:p-6">
        <Suspense>
          <ProjectDashboardView
            tasks={tasks}
            people={people}
            brands={brands}
            isStudioWide={true}
          />
        </Suspense>
      </PageBody>
    </Page>
  );
}

