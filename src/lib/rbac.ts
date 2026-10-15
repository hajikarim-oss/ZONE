// Who can do what.
//  ADMIN   = everything, incl. Team, Brands & clients, Automations.
//  MANAGER = can see and edit every project.
//  MEMBER  = sees tasks they're assigned to, created, or collaborate on.
//            Can add their own tasks (like Asana's My tasks).

export type Viewer = { id: string; role: string; department?: string };

// The parts of a task that decide who can see / edit it.
export type Access = { assigneeId: string | null; createdById?: string | null; collaboratorIds?: string[] };

export const isAdmin = (v: Viewer) => v.role === "ADMIN";
export const canSeeAll = (v: Viewer) => v.role === "ADMIN" || v.role === "MANAGER";
export const canManageTeam = (v: Viewer) => v.role === "ADMIN";
export const canManageBrands = (v: Viewer) => v.role === "ADMIN";
// Everyone on the team can add tasks; team members' tasks are assigned to themselves.
export const canCreateProjects = (_v: Viewer) => true;

// Fields the assignee may change on their task.
export const MEMBER_FIELDS = new Set(["editStatus", "scriptStage", "revisionRound", "shootStatus", "onHold"]);
// Extra fields a team member may change on a task they created themselves.
export const CREATOR_FIELDS = new Set([...MEMBER_FIELDS, "title", "brandId", "internalDeadline", "priority", "type", "platform"]);

export function canViewProject(v: Viewer, p: Access) {
  return canSeeAll(v) || p.assigneeId === v.id || p.createdById === v.id || !!p.collaboratorIds?.includes(v.id);
}

export function canEditField(v: Viewer, field: string, p: Access) {
  if (canSeeAll(v)) return true;
  if (p.createdById === v.id && CREATOR_FIELDS.has(field)) return true;
  return p.assigneeId === v.id && MEMBER_FIELDS.has(field);
}

export function canManageCollaborators(v: Viewer, p: Access) {
  return canSeeAll(v) || p.assigneeId === v.id || p.createdById === v.id;
}

// Prisma filter: the tasks a team member can see.
export function visibleToMember(userId: string) {
  return {
    OR: [{ assigneeId: userId }, { createdById: userId }, { collaborators: { some: { id: userId } } }],
  };
}
