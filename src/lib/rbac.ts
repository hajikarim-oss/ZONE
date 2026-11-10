// Who can do what.
//  ADMIN   = everything, incl. Team, Brands & clients, Automations.
//  MANAGER = can see and edit every project.
//  MEMBER  = sees tasks they're assigned to, created, or collaborate on.
//            Can add their own tasks (like Asana's My tasks).

// brandIds = brand workspaces the person is a member of.
export type Viewer = { id: string; role: string; department?: string; brandIds?: string[] };

// The parts of a task that decide who can see / edit it.
export type Access = {
  assigneeId: string | null;
  createdById?: string | null;
  collaboratorIds?: string[];
  subtaskAssigneeIds?: string[];
  brandId?: string | null;
};

export const isAdmin = (v: Viewer) => v.role === "ADMIN";
export const canSeeAll = (v: Viewer) => v.role === "ADMIN" || v.role === "MANAGER";
export const canManageTeam = (v: Viewer) => v.role === "ADMIN";
export const canManageBrands = (v: Viewer) => v.role === "ADMIN" || v.role === "MANAGER";
// Everyone on the team can add tasks; team members' tasks are assigned to themselves.
export const canCreateProjects = (_v: Viewer) => true;

// Point 3 Feedback: Team members have full edit rights on every field in the project panel for their tasks.
export const MEMBER_FIELDS = new Set([
  "title",
  "brandId",
  "campaignId",
  "type",
  "workType",
  "version",
  "platform",
  "dept",
  "assigneeId",
  "priority",
  "onHold",
  "internalDeadline",
  "externalDeadline",
  "startAt",
  "endAt",
  "storageId",
  "briefStage",
  "scriptStage",
  "preProStage",
  "shootStatus",
  "editStatus",
  "revisionRound",
  "clientReview",
  "finalApproval",
  "deliveryStatus",
  "notes",
  "context",
  "cost",
]);
export const CREATOR_FIELDS = new Set([...MEMBER_FIELDS]);
// Anyone working on a task can fill in these working details.
export const WORK_FIELDS = new Set(["startAt", "endAt", "storageId", "workType"]);

const isOnTask = (v: Viewer, p: Access) =>
  p.assigneeId === v.id || p.createdById === v.id || !!p.collaboratorIds?.includes(v.id);
const inWorkspace = (v: Viewer, p: Access) => !!p.brandId && !!v.brandIds?.includes(p.brandId);

export function canViewProject(v: Viewer, p: Access) {
  return canSeeAll(v) || isOnTask(v, p) || !!p.subtaskAssigneeIds?.includes(v.id);
}

export function canEditField(v: Viewer, field: string, p: Access) {
  if (canSeeAll(v)) return true;
  if (isOnTask(v, p) && MEMBER_FIELDS.has(field)) return true;
  if (WORK_FIELDS.has(field) && inWorkspace(v, p)) return true;
  return false;
}

export function canDeleteProject(v: Viewer, p: Access) {
  return canSeeAll(v) || p.assigneeId === v.id || p.createdById === v.id;
}

export function canManageCollaborators(v: Viewer, p: Access) {
  return canSeeAll(v) || p.assigneeId === v.id || p.createdById === v.id || inWorkspace(v, p);
}

// Subtasks and attachments: anyone who can see the task can add them.
export const canAddToTask = (v: Viewer, p: Access) => canViewProject(v, p);

// Prisma filter: "My tasks" — assigned to me, added by me, collaborating,
// or with a subtask assigned to me.
export function myTasksFilter(userId: string) {
  return {
    OR: [
      { assigneeId: userId },
      { createdById: userId },
      { collaborators: { some: { id: userId } } },
      { subtasks: { some: { assigneeId: userId } } },
    ],
  };
}

// Prisma filter: what a team member can see.
// Each person sees only their own tasks even on a shared brand workspace.
export function visibleToMember(userId: string) {
  return myTasksFilter(userId);
}
