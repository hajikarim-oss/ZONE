import Link from "next/link";
import Avatar from "@/components/Avatar";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";
import { capacityFor, computeDelay, computeStage, isDone, startOfToday } from "@/lib/status";
import { forViewer, taskInclude, toTaskDTO, type TaskDTO } from "@/lib/dto";
import { cn, fmtDate } from "@/lib/utils";

// Replaces the 📊 DASHBOARD tab: headline numbers, team status (who's busy,
// who's free, who's behind) and the delay tracker (editor vs brand delays).

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" | "green" }) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[26px] font-semibold tabular-nums tracking-tight",
          tone === "red" && "text-rose-600",
          tone === "amber" && "text-amber-600",
          tone === "green" && "text-emerald-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const CAP_STYLE: Record<string, string> = {
  Available: "bg-emerald-50 text-emerald-700",
  Busy: "bg-amber-50 text-amber-700",
  Overloaded: "bg-rose-50 text-rose-700",
};

export default async function HomePage() {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);

  const rows = await prisma.project.findMany({
    where: { archived: false, ...(seeAll ? {} : { assigneeId: me.id }) },
    include: taskInclude,
  });
  const tasks = rows.map((r) => forViewer(toTaskDTO(r), seeAll));
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
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <p className="text-[13px] text-muted">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
          {greeting()}, {me.name.split(" ")[0]}
        </h1>

        <div className={cn("mt-6 grid grid-cols-2 gap-3", seeAll ? "md:grid-cols-5" : "md:grid-cols-4")}>
          <Stat label={seeAll ? "Active projects" : "My active tasks"} value={active.length} />
          <Stat label="On track" value={onTrack} tone="green" />
          <Stat label={seeAll ? "Team delays" : "Late (on me)"} value={editorLate.length} tone={editorLate.length ? "red" : undefined} />
          <Stat label="Waiting on brand" value={brandLate.length} tone={brandLate.length ? "amber" : undefined} />
          {seeAll && <Stat label="Past client deadline" value={overdue.length} tone={overdue.length ? "red" : undefined} />}
        </div>

        <div className={cn("mt-8 grid gap-8", seeAll ? "lg:grid-cols-[1fr_1fr]" : "")}>
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Due in the next 7 days</h2>
              <Link href={seeAll ? "/projects" : "/my-tasks"} className="text-[12px] text-accent hover:underline">View all</Link>
            </div>
            <div className="rounded-lg border border-line">
              {dueSoon.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing due this week.</p>}
              {dueSoon.slice(0, 12).map((t) => (
                <Link
                  key={t.id}
                  href={`${seeAll ? "/projects" : "/my-tasks"}?task=${t.id}`}
                  className="flex items-center gap-3 border-b border-line/70 px-4 py-2 text-[13px] last:border-0 hover:bg-canvas"
                >
                  <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: t.brandColor ?? "#a2a0a2" }} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="hidden text-[12px] text-muted sm:inline">{computeStage(t).label}</span>
                  {seeAll && t.assigneeName && <Avatar name={t.assigneeName} size={20} />}
                  <span className="w-14 text-right text-[12px] text-emerald-700">{fmtDate(t.internalDeadline)}</span>
                </Link>
              ))}
            </div>
          </section>

          {seeAll && (
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">Team status</h2>
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-canvas text-left text-[12px] text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 text-right font-medium">Active</th>
                      <th className="px-2 py-2 text-right font-medium">Done</th>
                      <th className="px-2 py-2 text-right font-medium">Late</th>
                      <th className="px-2 py-2 font-medium">Capacity</th>
                      <th className="px-3 py-2 font-medium">Free from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map(({ u, ...r }) => (
                      <tr key={u.id} className="border-t border-line/70">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={u.name} size={22} />
                            <div className="leading-tight">
                              <div>{u.name}</div>
                              <div className="text-[11px] text-muted">{u.department}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 text-right tabular-nums">{r.active}</td>
                        <td className="px-2 text-right tabular-nums text-muted">{r.done}</td>
                        <td className={cn("px-2 text-right tabular-nums", r.late ? "text-rose-600" : "text-muted")}>{r.late}</td>
                        <td className="px-2"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CAP_STYLE[r.cap])}>{r.cap}</span></td>
                        <td className="px-3 text-[12px] text-muted">{r.active === 0 ? "Now" : r.freeFrom ? `After ${fmtDate(r.freeFrom)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {delays.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-1 text-[15px] font-semibold">Delay tracker</h2>
            {seeAll && <p className="mb-2 text-[12px] text-muted">Team late = past the team deadline while the work is with us. Waiting on brand = cut is with the client past their deadline.</p>}
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-canvas text-left text-[12px] text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-2 py-2 font-medium">Brand</th>
                    {seeAll && <th className="px-2 py-2 font-medium">Assignee</th>}
                    <th className="px-2 py-2 font-medium">{seeAll ? "Team due" : "Due"}</th>
                    {seeAll && <th className="px-2 py-2 font-medium">Client due</th>}
                    <th className="px-2 py-2 font-medium">Who&apos;s late</th>
                    <th className="px-2 py-2 text-right font-medium">Days</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {delays.map(({ t, d }) => (
                    <tr key={t.id} className="border-t border-line/70 hover:bg-canvas">
                      <td className="max-w-[280px] px-3 py-1.5">
                        <Link href={`${seeAll ? "/projects" : "/my-tasks"}?task=${t.id}`} className="block truncate hover:underline">{t.title}</Link>
                      </td>
                      <td className="px-2 text-muted">{t.brandName ?? "—"}</td>
                      {seeAll && <td className="px-2">{t.assigneeName ?? <span className="text-rose-600">Unassigned</span>}</td>}
                      <td className="px-2 text-muted">{fmtDate(t.internalDeadline) || "—"}</td>
                      {seeAll && <td className="px-2 text-muted">{fmtDate(t.externalDeadline) || "—"}</td>}
                      <td className="px-2">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", d.who === "EDITOR" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
                          {d.who === "EDITOR" ? "Team" : "Brand"}
                        </span>
                      </td>
                      <td className="px-2 text-right tabular-nums">{d.days}</td>
                      <td className="px-3 text-[12px] text-muted">{computeStage(t).label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
