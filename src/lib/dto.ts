import type { Brand, Project, User } from "@prisma/client";

// Serializable shape passed from server pages to client components.
export type TaskDTO = {
  id: string;
  code: string;
  title: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  type: string | null;
  platform: string | null;
  dept: string;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: string;
  externalDeadline: string | null;
  internalDeadline: string | null;
  briefStage: string;
  scriptStage: string;
  preProStage: string;
  shootStatus: string;
  editStatus: string;
  revisionRound: number;
  clientReview: string;
  finalApproval: string;
  deliveryStatus: string;
  notes: string | null;
  context: string | null;
  extDeadlineChanges: number;
  intDeadlineChanges: number;
  archived: boolean;
  onHold: boolean;
  createdById: string | null;
  createdByName: string | null;
  collaborators: { id: string; name: string }[];
  collaboratorIds: string[];
  addedOn: string;
  updatedAt: string;
};

export type PersonDTO = { id: string; name: string; department: string; active: boolean };
export type BrandDTO = { id: string; name: string; color: string };

export const taskInclude = {
  brand: true,
  assignee: true,
  createdBy: { select: { id: true, name: true } },
  collaborators: { select: { id: true, name: true }, orderBy: { name: "asc" } },
} as const;

type TaskRow = Project & {
  brand: Brand | null;
  assignee: User | null;
  createdBy: { id: string; name: string } | null;
  collaborators: { id: string; name: string }[];
};

export function toTaskDTO(p: TaskRow): TaskDTO {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    brandId: p.brandId,
    brandName: p.brand?.name ?? null,
    brandColor: p.brand?.color ?? null,
    type: p.type,
    platform: p.platform,
    dept: p.dept,
    assigneeId: p.assigneeId,
    assigneeName: p.assignee?.name ?? null,
    priority: p.priority,
    externalDeadline: p.externalDeadline?.toISOString() ?? null,
    internalDeadline: p.internalDeadline?.toISOString() ?? null,
    briefStage: p.briefStage,
    scriptStage: p.scriptStage,
    preProStage: p.preProStage,
    shootStatus: p.shootStatus,
    editStatus: p.editStatus,
    revisionRound: p.revisionRound,
    clientReview: p.clientReview,
    finalApproval: p.finalApproval,
    deliveryStatus: p.deliveryStatus,
    notes: p.notes,
    context: p.context,
    extDeadlineChanges: p.extDeadlineChanges,
    intDeadlineChanges: p.intDeadlineChanges,
    archived: p.archived,
    onHold: p.onHold,
    createdById: p.createdById,
    createdByName: p.createdBy?.name ?? null,
    collaborators: p.collaborators.map((c) => ({ id: c.id, name: c.name })),
    collaboratorIds: p.collaborators.map((c) => c.id),
    addedOn: p.addedOn.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Team members (MEMBER role) never receive the client deadline or internal
// notes — stripped here on the server so they aren't even in the page data.
export function forViewer(t: TaskDTO, seeAll: boolean): TaskDTO {
  if (seeAll) return t;
  return { ...t, externalDeadline: null, extDeadlineChanges: 0, notes: null };
}

export function toPeople(users: User[]): PersonDTO[] {
  return users.map((u) => ({ id: u.id, name: u.name, department: u.department, active: u.active }));
}

export function toBrands(brands: Brand[]): BrandDTO[] {
  return brands.map((b) => ({ id: b.id, name: b.name, color: b.color }));
}
