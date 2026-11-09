import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, DollarSign, Film, Sparkles, FolderGit2, Kanban, ExternalLink, Briefcase, Layers } from "lucide-react";
import Avatar from "@/components/Avatar";
import { JiraStatusLozenge, JiraEpicPill } from "@/components/jira/JiraBits";
import { Page, PageTopbar, StatStrip, Stat, SectionBar, TopbarAction, PageBody } from "@/components/layout/Page";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";
import { BOARD_COLUMNS, boardColumn, computeDelay, isDone } from "@/lib/status";
import { fmtDate, cn } from "@/lib/utils";

// Studio Portfolios & Campaign Plans (Email-System / Brae inspired):
// Every Brand and Campaign at a glance, with progress bars, tracked hours, and cost metrics.
export default async function PortfoliosPage() {
  const me = await requireTeamPage();
  if (!canSeeAll(me)) redirect("/home");

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      members: { select: { id: true, name: true } },
      campaigns: { select: { id: true, name: true, internalDeadline: true } },
      projects: {
        where: { archived: false },
        select: {
          id: true,
          briefStage: true,
          scriptStage: true,
          preProStage: true,
          shootStatus: true,
          editStatus: true,
          revisionRound: true,
          finalApproval: true,
          deliveryStatus: true,
          externalDeadline: true,
          internalDeadline: true,
          onHold: true,
          cost: true,
          timeEntries: {
            select: { durationMinutes: true, hourlyRate: true },
          },
        },
      },
    },
  });

  const rows = brands.map((b) => {
    const total = b.projects.length;
    const done = b.projects.filter((p) => isDone(p as any)).length;
    const inProgress = b.projects.filter((p) => {
      const c = boardColumn(p as any);
      return c === "ongoing" || c === "approval" || c === "revision";
    }).length;
    const todo = total - done - inProgress;
    const late = b.projects.filter((p) => computeDelay(p as any)).length;
    const nextDue = b.projects
      .filter((p) => !isDone(p as any) && p.internalDeadline)
      .map((p) => p.internalDeadline!)
      .sort((a, c) => a.getTime() - c.getTime())[0];
    const health = late === 0 ? "On track" : late <= 2 ? "At risk" : "Off track";

    const totalMinutes = b.projects.reduce((acc, p) => {
      const fromEntries = (p.timeEntries || []).reduce((sum, te) => sum + te.durationMinutes, 0);
      return acc + fromEntries;
    }, 0);
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    const totalCost = b.projects.reduce((acc, p) => {
      const entryCost = (p.timeEntries || []).reduce((sum, te) => sum + (te.durationMinutes / 60) * (te.hourlyRate || 0), 0);
      return acc + (p.cost != null ? p.cost : entryCost);
    }, 0);

    return { b, total, done, inProgress, todo, late, nextDue, health, totalHours, totalCost: Math.round(totalCost) };
  });

  const overallHours = Math.round(rows.reduce((sum, r) => sum + r.totalHours, 0) * 10) / 10;
  const overallCost = rows.reduce((sum, r) => sum + r.totalCost, 0);
  const overallProjects = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <Page>
      {/* Editorial Topbar */}
      <PageTopbar
        eyebrow="Studio Portfolios"
        subtitle="Campaign progress, tracked editing hours, and production cost rollup"
      >
        <TopbarAction
          variant="primary"
          href="/projects"
          icon={<Kanban className="size-3.5" />}
        >
          All Deliverables
        </TopbarAction>
      </PageTopbar>

      {/* Edge-to-edge StatStrip */}
      <StatStrip cols={4}>
        <Stat
          label="Active Brands"
          value={brands.length}
          sub="Client accounts"
        />
        <Stat
          label="Total Deliverables"
          value={overallProjects}
          sub="Videos & reels in pipeline"
        />
        <Stat
          label="Total Tracked Hours"
          value={`${overallHours}h`}
          sub="Time entries logged"
          tone="blue"
        />
        <Stat
          label="Total Production Cost"
          value={`₹${overallCost.toLocaleString("en-IN")}`}
          sub="Spend and payouts"
          tone="green"
          last
        />
      </StatStrip>

      {/* Page Body */}
      <PageBody className="p-5 md:p-6">
        <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]">
          <SectionBar label="PORTFOLIO ROADMAP MATRIX" count={`${rows.length} brands`} />

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                <tr>
                  <th className="px-4 py-2.5">Brand Project</th>
                  <th className="px-3 py-2.5">Campaigns</th>
                  <th className="px-3 py-2.5">Deliverable Progress</th>
                  <th className="px-3 py-2.5 text-right">Hours Logged</th>
                  <th className="px-3 py-2.5 text-right">Production Cost</th>
                  <th className="px-3 py-2.5">Health</th>
                  <th className="px-3 py-2.5">Next Due</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
                {rows.map(({ b, total, done, inProgress, todo, late, nextDue, health, totalHours, totalCost }) => {
                  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-[#0F141C] transition">
                      {/* Project Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-[4px] text-[12px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: b.color }}
                          >
                            {b.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <Link
                              href={`/brands/${b.id}`}
                              className="font-bold text-slate-950 hover:text-blue-600 hover:underline dark:text-white"
                            >
                              {b.name}
                            </Link>
                            {b.repositoryUrl && (
                              <a
                                href={b.repositoryUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5"
                              >
                                <FolderGit2 className="size-3" /> Drive Repo <ExternalLink className="size-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Campaigns */}
                      <td className="px-3 py-3 max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {b.campaigns.slice(0, 3).map((c) => (
                            <JiraEpicPill key={c.id} name={c.name} color={b.color} />
                          ))}
                          {b.campaigns.length > 3 && (
                            <span className="text-[10.5px] font-semibold text-slate-400">
                              +{b.campaigns.length - 3} more
                            </span>
                          )}
                          {b.campaigns.length === 0 && (
                            <span className="text-[11.5px] text-slate-400">No campaigns</span>
                          )}
                        </div>
                      </td>

                      {/* Progress Bar */}
                      <td className="px-3 py-3 min-w-[180px]">
                        <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                          <span className="text-slate-900 dark:text-white">{pct}% Complete</span>
                          <span className="text-slate-400 font-mono">{done}/{total}</span>
                        </div>
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                          <div style={{ width: `${pct}%` }} className="bg-emerald-500" title={`Done: ${done}`} />
                          <div
                            style={{ width: `${total ? (inProgress / total) * 100 : 0}%` }}
                            className="bg-blue-500"
                            title={`In Progress: ${inProgress}`}
                          />
                        </div>
                      </td>

                      {/* Logged Hours */}
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white font-mono">
                        {totalHours}h
                      </td>

                      {/* Cost */}
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        ₹{totalCost.toLocaleString("en-IN")}
                      </td>

                      {/* Health */}
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
                            health === "On track" && "bg-emerald-50 text-emerald-700",
                            health === "At risk" && "bg-amber-50 text-amber-700",
                            health === "Off track" && "bg-rose-50 text-rose-700"
                          )}
                        >
                          {health}
                        </span>
                      </td>

                      {/* Next Milestone */}
                      <td className="px-3 py-3 text-[11.5px] text-slate-500 font-mono">
                        {nextDue ? fmtDate(nextDue) : "—"}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/brands/${b.id}`}
                          className="h-7 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[11.5px] font-semibold text-slate-800 inline-flex items-center gap-1 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200"
                        >
                          <Kanban className="size-3" /> Board
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </PageBody>
    </Page>
  );
}
