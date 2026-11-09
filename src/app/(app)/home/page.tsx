import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Layers, RotateCcw, Sparkles, Plus, Kanban, Rows3, ShieldAlert, FolderGit2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import ManagerDayTimeline from "@/components/timeline/ManagerDayTimeline";
import DashboardWorkTracker from "@/components/dashboard/DashboardWorkTracker";
import { JiraIssueTypeIcon, JiraIssueKey, JiraStatusLozenge, JiraEpicPill } from "@/components/jira/JiraBits";
import { Page, PageTopbar, StatStrip, Stat, SectionBar, TopbarAction, PageBody } from "@/components/layout/Page";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll, myTasksFilter } from "@/lib/rbac";
import { BOARD_COLUMNS, boardColumn, capacityFor, computeDelay, isDone, startOfToday } from "@/lib/status";
import { forViewer, taskInclude, toPeople, toTaskDTO, type TaskDTO } from "@/lib/dto";
import { cn, fmtDate } from "@/lib/utils";

const CAP_STYLE: Record<string, string> = {
  Available: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Busy: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Overloaded: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

export default async function HomePage() {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);

  const rows = await prisma.project.findMany({
    where: { archived: false, ...(seeAll ? {} : myTasksFilter(me.id)) },
    include: taskInclude,
  });
  const tasks = rows.map((r) => forViewer(toTaskDTO(r), seeAll));
  const inRevision = tasks.filter((t) => !isDone(t) && boardColumn(t) === "revision").length;
  const [projects, favs] = await Promise.all([
    seeAll
      ? prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, repositoryUrl: true } })
      : prisma.brand.findMany({
          where: { OR: [{ members: { some: { id: me.id } } }, { projects: { some: { archived: false, ...myTasksFilter(me.id) } } }] },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true, repositoryUrl: true },
        }),
    prisma.brand.findMany({ where: { favoritedBy: { some: { id: me.id } } }, select: { id: true } }),
  ]);
  const favoriteProjects = projects.filter((b) => favs.some((f) => f.id === b.id));
  const openByBrand = new Map<string, number>();
  for (const t of tasks) if (t.brandId && !isDone(t)) openByBrand.set(t.brandId, (openByBrand.get(t.brandId) ?? 0) + 1);
  const active = tasks.filter((t) => !isDone(t));
  const withDelay = active.map((t) => ({ t, d: computeDelay(t) }));
  const editorLate = withDelay.filter((x) => x.d?.who === "EDITOR");
  const brandLate = withDelay.filter((x) => x.d?.who === "BRAND");
  const overdue = withDelay.filter((x) => x.d?.overdue);
  const onTrack = active.length - editorLate.length - brandLate.length;

  const today = startOfToday();
  const weekOut = new Date(today);
  weekOut.setDate(today.getDate() + 7);
  const dueSoon = active
    .filter((t) => t.internalDeadline && new Date(t.internalDeadline) >= today && new Date(t.internalDeadline) <= weekOut)
    .sort((a, b) => a.internalDeadline!.localeCompare(b.internalDeadline!));

  // Team status
  const people = seeAll ? await prisma.user.findMany({ where: { active: true }, orderBy: [{ department: "asc" }, { name: "asc" }] }) : [];
  const team = people.map((u) => {
    const mine = tasks.filter((t) => t.assigneeId === u.id);
    const act = mine.filter((t) => !isDone(t));
    const late = act.filter((t) => computeDelay(t)?.who === "EDITOR");
    const lastDl = act.map((t) => t.internalDeadline).filter(Boolean).sort().pop() ?? null;
    return { u, active: act.length, done: mine.length - act.length, late: late.length, cap: capacityFor(act.length), freeFrom: lastDl };
  });

  const delays = withDelay
    .filter((x) => x.d)
    .sort((a, b) => b.d!.days - a.d!.days)
    .slice(0, 25) as { t: TaskDTO; d: NonNullable<ReturnType<typeof computeDelay>> }[];

  return (
    <Page>
      {/* Editorial Topbar (Newsreader styling from Email-System) */}
      <PageTopbar
        eyebrow={`Studio Overview · Welcome, ${me.name.split(" ")[0]}`}
        subtitle="Real-time post-production telemetry, team day timeline, and delay radar"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-slate-500 bg-stone-100 dark:bg-white/10 px-2 py-0.5 rounded">
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
          </span>
          <TopbarAction
            variant="primary"
            href={seeAll ? "/projects" : "/my-tasks"}
            icon={<Kanban className="size-3.5" />}
          >
            Active Kanban
          </TopbarAction>
        </div>
      </PageTopbar>

      {/* Dense StatStrip with vertical hairline dividers */}
      <StatStrip cols={5}>
        <Stat
          label={seeAll ? "Active Deliverables" : "My Open Deliverables"}
          value={active.length}
          sub={`${tasks.length} total deliverables`}
          tone="blue"
        />
        <Stat
          label="On Track"
          value={onTrack}
          sub="No schedule delays"
          tone="green"
          accent
        />
        <Stat
          label={seeAll ? "Team Delays" : "Late On Me"}
          value={editorLate.length}
          sub="Requires editor attention"
          tone={editorLate.length ? "red" : undefined}
        />
        <Stat
          label="In Revision"
          value={inRevision}
          sub="Client feedback fixes"
          tone={inRevision ? "amber" : undefined}
        />
        <Stat
          label="Past Client Deadline"
          value={overdue.length}
          sub="Master delivery breached"
          tone={overdue.length ? "red" : undefined}
          last
        />
      </StatStrip>

      {/* Page Content Body */}
      <PageBody className="p-5 md:p-6 space-y-6">
        {/* Manager Live Day Timeline (9 AM - 9 PM) */}
        {seeAll && (
          <div>
            <ManagerDayTimeline people={toPeople(people)} tasks={tasks} />
          </div>
        )}

        {/* Brands & Projects Directory */}
        <div>
          <SectionBar label="ACTIVE BRANDS & DIRECTORY" count={`${projects.length} brands`}>
            <Link href="/projects" className="text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              View all ({projects.length}) →
            </Link>
          </SectionBar>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 pt-3">
            {projects.map((b) => {
              const isFav = favoriteProjects.some((f) => f.id === b.id);
              const count = openByBrand.get(b.id) ?? 0;
              return (
                <Link
                  key={b.id}
                  href={`/brands/${b.id}`}
                  className="group relative flex flex-col justify-between rounded-xl border border-stone-200/90 bg-white p-3.5 shadow-2xs transition hover:border-slate-900 hover:shadow-xs dark:border-[#2C3B53] dark:bg-[#161B22]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-white shadow-2xs"
                      style={{ backgroundColor: b.color || "#6366f1" }}
                    >
                      {b.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1">
                      {isFav && <span className="text-amber-500 text-[11px]" title="Starred Brand">★</span>}
                      <span className="font-mono text-[10.5px] font-semibold rounded bg-stone-100 dark:bg-white/10 px-1.5 py-0.5 text-slate-600 dark:text-slate-300">
                        {count} open
                      </span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="truncate text-[13px] font-bold text-slate-950 group-hover:text-blue-600 transition-colors dark:text-white dark:group-hover:text-blue-400">
                      {b.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Creative Brand</span>
                      <span className="font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 2-Column Section: Deliverables Action Queue & Team Capacity */}
        <div className={cn("grid gap-6", seeAll ? "lg:grid-cols-2" : "")}>
          {/* Interactive Live Work Session & Deliverables Action Queue */}
          <div>
            <DashboardWorkTracker
              tasks={tasks}
              currentUserId={me.id}
              isManager={seeAll}
            />
          </div>

          {/* Team Capacity & Status */}
          {seeAll && (
            <div className="rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]">
              <SectionBar label="TEAM WORKLOAD & CAPACITY" count={`${team.length} members`}>
                <Link href="/team" className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Manage team
                </Link>
              </SectionBar>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                      <th className="py-2 px-4">Member</th>
                      <th className="py-2 text-right">Active</th>
                      <th className="py-2 text-right">Done</th>
                      <th className="py-2 text-right">Late</th>
                      <th className="py-2 px-3">Capacity</th>
                      <th className="py-2 pr-4">Free From</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
                    {team.map(({ u, ...r }) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#0F141C]">
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={u.name} size={20} />
                            <div className="leading-tight">
                              <span className="font-semibold text-slate-900 dark:text-white">{u.name}</span>
                              <div className="text-[10px] text-slate-400 font-mono">{u.department}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{r.active}</td>
                        <td className="py-2 text-right tabular-nums text-slate-400">{r.done}</td>
                        <td className={cn("py-2 text-right tabular-nums font-bold", r.late ? "text-rose-600" : "text-slate-400")}>
                          {r.late}
                        </td>
                        <td className="py-2 px-3">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", CAP_STYLE[r.cap])}>
                            {r.cap}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-[11px] text-slate-500">
                          {r.active === 0 ? "Now" : r.freeFrom ? `After ${fmtDate(r.freeFrom)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Delay & Escalation Radar */}
        {delays.length > 0 && (
          <div className="rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]">
            <SectionBar label="DELAY & ESCALATION RADAR" count={`${delays.length} delayed`}>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Separates internal team delays from client feedback delays
              </span>
            </SectionBar>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                    <th className="py-2 px-4">Deliverable</th>
                    <th className="py-2">Brand & Campaign</th>
                    {seeAll && <th className="py-2">Assignee</th>}
                    <th className="py-2">Team Due</th>
                    {seeAll && <th className="py-2">Client Due</th>}
                    <th className="py-2">Delay Cause</th>
                    <th className="py-2 text-right">Days Overdue</th>
                    <th className="py-2 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
                  {delays.map(({ t, d }) => {
                    const isSevere = d.days >= 3;
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "transition cursor-pointer",
                          isSevere
                            ? "hover:bg-rose-50/60 dark:hover:bg-rose-950/20"
                            : "hover:bg-slate-50 dark:hover:bg-[#0F141C]"
                        )}
                      >
                        <td className="py-2.5 px-4 max-w-[260px]">
                          <div className="flex items-center gap-2">
                            <JiraIssueTypeIcon type={t.type} />
                            <JiraIssueKey code={t.code} />
                            <Link
                              href={`${seeAll ? "/projects" : "/my-tasks"}?task=${t.id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 hover:underline truncate dark:text-white text-[12.5px]"
                              title={t.title}
                            >
                              {t.title}
                            </Link>
                          </div>
                        </td>
                        <td className="py-2.5 text-slate-500">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{t.brandName ?? "—"}</span>
                          {t.campaignName && (
                            <span className="text-[10px] block text-purple-600 dark:text-purple-400 font-semibold truncate max-w-[120px]">
                              {t.campaignName}
                            </span>
                          )}
                        </td>
                        {seeAll && (
                          <td className="py-2.5">
                            {t.assigneeName ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar name={t.assigneeName} size={18} />
                                <span className="text-slate-900 dark:text-white font-medium">{t.assigneeName}</span>
                              </div>
                            ) : (
                              <span className="font-bold text-rose-600">Unassigned</span>
                            )}
                          </td>
                        )}
                        <td className="py-2.5 text-slate-500 font-medium">{fmtDate(t.internalDeadline) || "—"}</td>
                        {seeAll && <td className="py-2.5 text-slate-500">{fmtDate(t.externalDeadline) || "—"}</td>}
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border",
                              d.who === "EDITOR"
                                ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                            )}
                          >
                            {isSevere && <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />}
                            {d.who === "EDITOR" ? "Team Late" : "Client Feedback"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold tabular-nums">
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[11px]",
                            isSevere
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-extrabold"
                              : "text-rose-600"
                          )}>
                            +{d.days}d
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <JiraStatusLozenge boardKey={boardColumn(t)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageBody>
    </Page>
  );
}
