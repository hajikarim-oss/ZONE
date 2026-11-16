import GoalsClient from "./goals-client";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeAll } from "@/lib/rbac";

// Goals (Point 1 Feedback): Goals Panel with task linking, member performance tracking, and live progress analytics.
export default async function GoalsPage() {
  const me = await requireTeamPage();
  const [goals, people, brands, projects, timeEntries, subtasks] = await Promise.all([
    prisma.goal.findMany({
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        owner: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, campaigns: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { archived: false },
      select: {
        id: true,
        code: true,
        title: true,
        brandId: true,
        campaignId: true,
        goalId: true,
        assigneeId: true,
        editStatus: true,
        deliveryStatus: true,
        internalDeadline: true,
        closedAt: true,
        revisionRound: true,
      },
    }),
    prisma.timeEntry.findMany({
      select: {
        userId: true,
        durationMinutes: true,
        projectId: true,
        subtaskId: true,
      },
    }),
    prisma.subtask.findMany({
      select: {
        id: true,
        projectId: true,
        goalId: true,
        assigneeId: true,
        done: true,
        status: true,
        timeSpentMinutes: true,
      },
    }),
  ]);

  // Compute live progress per goal from linked tasks and subtasks
  const enrichedGoals = goals.map((g) => {
    const linkedTasks = projects.filter((p) => {
      if (p.goalId === g.id) return true;
      if (g.brandId && p.brandId !== g.brandId) return false;
      if (g.ownerId && g.brandId && p.assigneeId !== g.ownerId) return false;
      if (g.ownerId && !g.brandId && p.assigneeId !== g.ownerId) return false;
      return false;
    });

    const linkedSubtasks = subtasks.filter((s) => s.goalId === g.id);

    const totalWorkUnits = linkedTasks.length + linkedSubtasks.length;
    const doneTasks = linkedTasks.filter(
      (p) =>
        p.deliveryStatus === "Project Closed" ||
        p.editStatus === "Completed" ||
        p.editStatus === "Delivered" ||
        p.closedAt !== null
    ).length;
    const doneSubtasks = linkedSubtasks.filter((s) => s.done || s.status === "Done").length;
    const totalDone = doneTasks + doneSubtasks;

    const autoProgress = totalWorkUnits > 0 ? Math.round((totalDone / totalWorkUnits) * 100) : g.progress;

    return {
      id: g.id,
      title: g.title,
      ownerId: g.ownerId,
      ownerName: g.owner?.name ?? null,
      brandId: g.brandId,
      brandName: g.brand?.name ?? null,
      brandColor: g.brand?.color ?? null,
      dueDate: g.dueDate?.toISOString() ?? null,
      progress: g.progress,
      autoProgress,
      linkedTotalTasks: totalWorkUnits,
      linkedDoneTasks: totalDone,
      status: g.status,
      notes: g.notes,
    };
  });

  // Compute comprehensive team member performance analytics
  const memberAnalytics = people.map((person) => {
    const assignedTasks = projects.filter((p) => p.assigneeId === person.id);
    const assignedSubtasks = subtasks.filter((s) => s.assigneeId === person.id);
    const completedTasks = assignedTasks.filter(
      (p) =>
        p.deliveryStatus === "Project Closed" ||
        p.editStatus === "Completed" ||
        p.editStatus === "Delivered" ||
        p.closedAt !== null
    );
    const completedSubtasks = assignedSubtasks.filter((s) => s.done || s.status === "Done");

    // On-Time Delivery Calculation
    const onTimeCompleted = completedTasks.filter((p) => {
      if (!p.internalDeadline || !p.closedAt) return true;
      return new Date(p.closedAt).getTime() <= new Date(p.internalDeadline).getTime() + 24 * 60 * 60 * 1000;
    }).length;
    const onTimeRate =
      completedTasks.length > 0 ? Math.round((onTimeCompleted / completedTasks.length) * 100) : 100;

    // Total hours logged
    const personMinutes = timeEntries
      .filter((te) => te.userId === person.id)
      .reduce((sum, te) => sum + te.durationMinutes, 0);
    const totalHours = Number((personMinutes / 60).toFixed(1));

    // Goals owned
    const ownedGoals = enrichedGoals.filter((g) => g.ownerId === person.id);
    const achievedGoals = ownedGoals.filter((g) => g.status === "Achieved" || g.autoProgress >= 100);

    return {
      userId: person.id,
      name: person.name,
      department: person.department,
      totalAssignedTasks: assignedTasks.length,
      completedTasks: completedTasks.length,
      assignedSubtasks: assignedSubtasks.length,
      completedSubtasks: completedSubtasks.length,
      onTimeRate,
      totalHours,
      goalsCount: ownedGoals.length,
      achievedGoalsCount: achievedGoals.length,
      averageGoalProgress:
        ownedGoals.length > 0
          ? Math.round(ownedGoals.reduce((sum, g) => sum + g.autoProgress, 0) / ownedGoals.length)
          : 0,
    };
  });

  return (
    <GoalsClient
      meId={me.id}
      canManage={canSeeAll(me)}
      people={people}
      brands={brands}
      goals={enrichedGoals}
      memberAnalytics={memberAnalytics}
    />
  );
}
