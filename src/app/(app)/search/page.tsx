import type { Prisma } from "@prisma/client";
import { Suspense } from "react";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import { requireTeamPage } from "@/lib/auth";
import { canSeeAll } from "@/lib/rbac";
import { SAVED_SEARCHES } from "@/lib/saved-searches";
import { loadWorkspace } from "@/lib/workspace";

const DELIVERED = ["Files Sent", "Invoice Raised", "Project Closed"];

// Search (top bar) and Saved searches (sidebar).
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; preset?: string }> }) {
  const { q = "", preset = "" } = await searchParams;
  const me = await requireTeamPage();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const open: Prisma.ProjectWhereInput = { deliveryStatus: { notIn: DELIVERED } };

  const presets: Record<string, Prisma.ProjectWhereInput> = {
    "due-week": { ...open, onHold: false, internalDeadline: { gte: today, lt: weekEnd } },
    overdue: { ...open, onHold: false, internalDeadline: { lt: today } },
    revision: { ...open, onHold: false, editStatus: { contains: "Revision" } },
    "on-hold": { onHold: true },
    "completed-week": { deliveryStatus: { in: DELIVERED }, updatedAt: { gte: weekAgo } },
    "added-by-me": { createdById: me.id },
    unassigned: canSeeAll(me) ? { ...open, assigneeId: null } : { id: "__none__" },
  };
  const p = SAVED_SEARCHES.find((s) => s.key === preset);
  const term = q.trim();
  const where: Prisma.ProjectWhereInput = {
    archived: preset === "completed-week" ? undefined : false,
    ...(p ? presets[p.key] : {}),
    ...(term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { code: { contains: term, mode: "insensitive" } },
            { context: { contains: term, mode: "insensitive" } },
            { brand: { name: { contains: term, mode: "insensitive" } } },
            { subtasks: { some: { title: { contains: term, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const PRESET_DESCRIPTIONS: Record<string, string> = {
    "due-week": "Deliverables scheduled for delivery within the next 7 days",
    overdue: "Deliverables past internal deadline requiring escalation and immediate progress",
    revision: "Deliverables currently undergoing revision following internal or client review",
    "on-hold": "Deliverables paused or waiting on brand feedback / assets",
    "completed-week": "Deliverables finalized and marked done over the past 7 days",
    "added-by-me": "Deliverables created or initiated by you",
    unassigned: "Deliverables currently unallocated without an assigned editor",
  };

  const hasQuery = !!p || !!term;
  const data = await loadWorkspace(me, hasQuery ? where : { id: "__none__" });

  return (
    <Suspense>
      <TaskWorkspace
        key={`${preset}|${term}`}
        title={p ? p.label : term ? `Search: “${term}”` : "Search"}
        subtitle={
          hasQuery
            ? `${data.tasks.length} deliverable${data.tasks.length === 1 ? "" : "s"} · ${
                (p && PRESET_DESCRIPTIONS[p.key]) || "Filtered production view"
              }`
            : "Type in the search box at the top, or pick a saved search in the sidebar."
        }
        mode="all"
        showDoneDefault={preset === "completed-week" || !!term}
        defaultGroupBy="board"
        {...data}
      />
    </Suspense>
  );
}
