// Who can do what. Mirrors the sheet setup:
//  ADMIN   = Master sheet owner (Sachin): everything, incl. Team + Brands.
//  MANAGER = can see and edit every project (account managers / leads).
//  MEMBER  = old person tab: sees only their own projects and can update
//            only status, revision round and their notes.

export type Viewer = { id: string; role: string; department?: string };

export const isAdmin = (v: Viewer) => v.role === "ADMIN";
export const canSeeAll = (v: Viewer) => v.role === "ADMIN" || v.role === "MANAGER";
export const canManageTeam = (v: Viewer) => v.role === "ADMIN";
export const canManageBrands = (v: Viewer) => v.role === "ADMIN";
export const canCreateProjects = (v: Viewer) => canSeeAll(v);

// Fields an assignee may change on their own project (old cols H/I/J).
export const MEMBER_FIELDS = new Set(["editStatus", "scriptStage", "revisionRound", "shootStatus"]);

export function canEditField(v: Viewer, field: string, assigneeId: string | null) {
  if (canSeeAll(v)) return true;
  return assigneeId === v.id && MEMBER_FIELDS.has(field);
}

export function canViewProject(v: Viewer, assigneeId: string | null) {
  return canSeeAll(v) || assigneeId === v.id;
}
