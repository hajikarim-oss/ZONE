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

// Fields the assignee may change on their task.
// (deliveryStatus / finalApproval so they can move their task to Completed or reopen it.)
export const MEMBER_FIELDS = new Set(["editStatus", "scriptStage", "revisionRound", "shootStatus", "onHold", "deliveryStatus", "finalApproval", "workType"]);
// Extra fields a team member may change on a task they created themselves.
export const CREATOR_FIELDS = new Set([...MEMBER_FIELDS, "title", "brandId", "campaignId", "internalDeadline", "priority", "type", "platform", "context", "assigneeId", "version", "cost"]);
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
  if (WORK_FIELDS.has(field) && (isOnTask(v, p) || inWorkspace(v, p))) return true;
  if (p.createdById === v.id && CREATOR_FIELDS.has(field)) return true;
  return p.assigneeId === v.id && MEMBER_FIELDS.has(field);
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
