import type { Attachment, Brand, Project, StorageDevice, User } from "@prisma/client";

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
  // Three date fields
  startDate: string | null;        // when work begins (datetime)
  internalDeadline: string | null; // End Date — internal handoff
  externalDeadline: string | null; // Due Date — client/project close
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
  estimatedHours: number | null;
  storageDeviceId: string | null;
  storageDeviceName: string | null;
  extDeadlineChanges: number;
  intDeadlineChanges: number;
  archived: boolean;
  onHold: boolean;
  createdById: string | null;
  createdByName: string | null;
  collaborators: { id: string; name: string }[];
  collaboratorIds: string[];
  commentCount: number;
  // Subtask support
  parentId: string | null;
  subtaskCount: number;
  addedOn: string;
  updatedAt: string;
};

export type AttachmentDTO = {
  id: string;
  url: string;
  label: string | null;
  addedById: string | null;
  createdAt: string;
};

export type StorageDeviceDTO = { id: string; name: string };
export type PersonDTO = { id: string; name: string; department: string; active: boolean };
export type BrandDTO = { id: string; name: string; color: string };

export const taskInclude = {
  brand: true,
  assignee: true,
  createdBy: { select: { id: true, name: true } },
  collaborators: { select: { id: true, name: true }, orderBy: { name: "asc" } },
  storageDevice: { select: { id: true, name: true } },
  attachments: { orderBy: { createdAt: "asc" } },
  _count: { select: { updates: true, subtasks: true } },
} as const;

type TaskRow = Project & {
  brand: Brand | null;
  assignee: User | null;
  createdBy: { id: string; name: string } | null;
  collaborators: { id: string; name: string }[];
  storageDevice: { id: string; name: string } | null;
  attachments: Attachment[];
  _count?: { updates: number; subtasks: number };
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
    startDate: p.startDate?.toISOString() ?? null,
    internalDeadline: p.internalDeadline?.toISOString() ?? null,
    externalDeadline: p.externalDeadline?.toISOString() ?? null,
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
    estimatedHours: p.estimatedHours,
    storageDeviceId: p.storageDeviceId,
    storageDeviceName: p.storageDevice?.name ?? null,
    extDeadlineChanges: p.extDeadlineChanges,
    intDeadlineChanges: p.intDeadlineChanges,
    archived: p.archived,
    onHold: p.onHold,
    createdById: p.createdById,
    createdByName: p.createdBy?.name ?? null,
    collaborators: p.collaborators.map((c) => ({ id: c.id, name: c.name })),
    collaboratorIds: p.collaborators.map((c) => c.id),
    commentCount: p._count?.updates ?? 0,
    parentId: p.parentId,
    subtaskCount: p._count?.subtasks ?? 0,
    addedOn: p.addedOn.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Team members (MEMBER role) never receive the client deadline or internal
// notes — stripped here on the server so they aren't even in the page data.
export function forViewer(t: TaskDTO, seeAll: boolean): TaskDTO {
  if (seeAll) return t;
  return { ...t, externalDeadline: null, extDeadlineChanges: 0, notes: null, estimatedHours: null };
}

export function toPeople(users: User[]): PersonDTO[] {
  return users.map((u) => ({ id: u.id, name: u.name, department: u.department, active: u.active }));
}

export function toBrands(brands: Brand[]): BrandDTO[] {
  return brands.map((b) => ({ id: b.id, name: b.name, color: b.color }));
}

export function toStorageDevices(devices: StorageDevice[]): StorageDeviceDTO[] {
  return devices.map((d) => ({ id: d.id, name: d.name }));
}

export function toAttachmentDTO(a: Attachment): AttachmentDTO {
  return { id: a.id, url: a.url, label: a.label, addedById: a.addedById, createdAt: a.createdAt.toISOString() };
}
