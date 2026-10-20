import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";
import { BOARD_COLUMNS, boardColumn, computeDelay, isDone } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

// Portfolios (like Asana): every project / brand at a glance, with progress.
export default async function PortfoliosPage() {
  const me = await requireTeamPage();
  if (!canSeeAll(me)) redirect("/home");

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      members: { select: { id: true, name: true } },
      projects: {
        where: { archived: false },
        select: {
          id: true, briefStage: true, scriptStage: true, preProStage: true, shootStatus: true, editStatus: true, revisionRound: true,
          finalApproval: true, deliveryStatus: true, externalDeadline: true, internalDeadline: true, onHold: true,
        },
      },
    },
  });

  const rows = brands.map((b) => {
    const total = b.projects.length;
    const done = b.projects.filter((p) => isDone(p)).length;
    const cols = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, b.projects.filter((p) => boardColumn(p) === c.key).length]));
    const late = b.projects.filter((p) => computeDelay(p)).length;
    const nextDue = b.projects
      .filter((p) => !isDone(p) && p.internalDeadline)
      .map((p) => p.internalDeadline!)
      .sort((a, c) => a.getTime() - c.getTime())[0];
    const health = late === 0 ? "On track" : late <= 2 ? "At risk" : "Off track";
    return { b, total, done, cols, late, nextDue, health };
  });

  const tone: Record<string, string> = {
    "On track": "bg-emerald-50 text-emerald-700",
    "At risk": "bg-amber-50 text-amber-700",
    "Off track": "bg-rose-50 text-rose-700",
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
        <h1 className="text-[24px] font-semibold tracking-tight">Portfolios</h1>
        <p className="mt-1 text-[13px] text-muted">Every project at a glance: progress, status and what&apos;s late.</p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-canvas text-left text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Health</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                {BOARD_COLUMNS.filter((c) => c.key !== "completed").map((c) => (
                  <th key={c.key} className="px-2 py-2 text-center font-medium">{c.label}</th>
                ))}
                <th className="px-2 py-2 text-center font-medium">Late</th>
                <th className="px-3 py-2 font-medium">Next due</th>
                <th className="px-3 py-2 font-medium">Members</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted">No projects yet.</td></tr>
              )}
              {rows.map(({ b, total, done, cols, late, nextDue, health }) => (
                <tr key={b.id} className="border-t border-line/70 hover:bg-canvas">
                  <td className="px-3 py-2.5">
                    <Link href={`/brands/${b.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                      <span className="h-3 w-3 rounded-[3px]" style={{ background: b.color }} />
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[health]}`}>{total ? health : "—"}</span></td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[11px] text-muted">{done}/{total}</span>
                    </div>
                  </td>
                  {BOARD_COLUMNS.filter((c) => c.key !== "completed").map((c) => (
                    <td key={c.key} className="px-2 text-center text-muted">{cols[c.key] || ""}</td>
                  ))}
                  <td className={`px-2 text-center ${late ? "font-semibold text-rose-600" : "text-muted"}`}>{late || ""}</td>
                  <td className="px-3 text-muted">{nextDue ? fmtDate(nextDue) : "—"}</td>
                  <td className="px-3">
                    <div className="flex -space-x-1.5">
                      {b.members.slice(0, 4).map((m) => (
                        <span key={m.id} className="rounded-full ring-2 ring-surface" title={m.name}><Avatar name={m.name} size={22} /></span>
                      ))}
                      {b.members.length > 4 && <span className="pl-2 text-[11px] text-muted">+{b.members.length - 4}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">Health: On track = nothing late · At risk = 1–2 late tasks · Off track = 3 or more.</p>
      </div>
    </div>
  );
}
