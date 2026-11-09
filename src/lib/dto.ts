import type { Brand, Campaign, Project, TimeEntry, User } from "@prisma/client";

// Serializable shape passed from server pages to client components.
export type TaskDTO = {
  id: string;
  code: string;
  title: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  campaignId: string | null;
  campaignName: string | null;
  type: string | null;
  workType: string | null;
  version: number;
  cost: number | null;
  totalDurationMinutes: number;
  totalHours: number;
  brandRepositoryUrl: string | null;
  campaignRepositoryUrl: string | null;
  platform: string | null;
  dept: string;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: string;
  externalDeadline: string | null;
  internalDeadline: string | null; // "Due date"
  startAt: string | null;
  endAt: string | null;
  storageId: string | null;
  storageName: string | null;
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
  commentCount: number;
  latestUpdate?: {
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
  } | null;
  lastTeamUpdateAt?: string | null;
  subtaskCount: number;
  subtaskDone: number;
  subtaskAssigneeIds: string[];
  attachmentCount: number;
  addedOn: string;
  updatedAt: string;
};

export type PersonDTO = { id: string; name: string; department: string; active: boolean; hourlyRate?: number | null };
export type CampaignDTO = {
  id: string;
  name: string;
  brandId: string;
  repositoryUrl: string | null;
  internalDeadline: string | null;
  externalDeadline: string | null;
  budget: number | null;
  status: string;
};
export type BrandDTO = {
  id: string;
  name: string;
  color: string;
  pocName?: string | null;
  pocEmail?: string | null;
  repositoryUrl?: string | null;
  guidelines?: string | null;
  campaigns?: CampaignDTO[];
};
export type StorageDTO = { id: string; name: string };
export type TimeEntryDTO = {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  date: string;
  durationMinutes: number;
  hours: number;
  workType: string | null;
  notes: string | null;
  hourlyRate: number | null;
  cost: number;
  createdAt: string;
};

export const taskInclude = {
  brand: true,
  campaign: true,
  assignee: true,
  createdBy: { select: { id: true, name: true } },
  collaborators: { select: { id: true, name: true }, orderBy: { name: "asc" } },
  storage: { select: { id: true, name: true } },
  subtasks: { select: { id: true, done: true, assigneeId: true } },
  timeEntries: { select: { durationMinutes: true, hourlyRate: true } },
  updates: {
    take: 1,
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, authorName: true, createdAt: true },
  },
  _count: { select: { updates: true, attachments: true } },
} as const;

type TaskRow = Project & {
  brand: Brand | null;
  campaign?: Campaign | null;
  assignee: User | null;
  createdBy: { id: string, name: string } | null;
  collaborators: { id: string; name: string }[];
  storage?: { id: string; name: string } | null;
  subtasks?: { id: string; done: boolean; assigneeId: string | null }[];
  timeEntries?: { durationMinutes: number; hourlyRate: number | null }[];
  updates?: { id: string; body: string; authorName: string; createdAt: Date }[];
  _count?: { updates: number; attachments?: number };
};

export function toTaskDTO(p: TaskRow): TaskDTO {
  const totalMins = (p.timeEntries ?? []).reduce((sum, te) => sum + te.durationMinutes, 0);
  const calculatedCost = (p.timeEntries ?? []).reduce((sum, te) => sum + (te.durationMinutes / 60) * (te.hourlyRate || 0), 0);
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    brandId: p.brandId,
    brandName: p.brand?.name ?? null,
    brandColor: p.brand?.color ?? null,
    campaignId: p.campaignId ?? null,
    campaignName: p.campaign?.name ?? null,
    type: p.type,
    workType: (p as any).workType ?? null,
    version: (p as any).version ?? 1,
    cost: (p as any).cost ?? (calculatedCost > 0 ? Math.round(calculatedCost) : null),
    totalDurationMinutes: totalMins,
    totalHours: Number((totalMins / 60).toFixed(1)),
    brandRepositoryUrl: (p.brand as any)?.repositoryUrl ?? null,
    campaignRepositoryUrl: p.campaign?.repositoryUrl ?? null,
    platform: p.platform,
    dept: p.dept,
    assigneeId: p.assigneeId,
    assigneeName: p.assignee?.name ?? null,
    priority: p.priority,
    externalDeadline: p.externalDeadline?.toISOString() ?? (p.campaign?.externalDeadline?.toISOString() ?? null),
    internalDeadline: p.internalDeadline?.toISOString() ?? (p.campaign?.internalDeadline?.toISOString() ?? null),
    startAt: p.startAt?.toISOString() ?? null,
    endAt: p.endAt?.toISOString() ?? null,
    storageId: p.storageId ?? null,
    storageName: p.storage?.name ?? null,
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
    commentCount: p._count?.updates ?? 0,
    latestUpdate: p.updates?.[0]
      ? {
          id: p.updates[0].id,
          body: p.updates[0].body,
          authorName: p.updates[0].authorName,
          createdAt: p.updates[0].createdAt.toISOString(),
        }
      : null,
    lastTeamUpdateAt: p.lastTeamUpdateAt?.toISOString() ?? null,
    subtaskCount: p.subtasks?.length ?? 0,
    subtaskDone: p.subtasks?.filter((x) => x.done).length ?? 0,
    subtaskAssigneeIds: [...new Set((p.subtasks ?? []).map((x) => x.assigneeId).filter((x): x is string => !!x))],
    attachmentCount: p._count?.attachments ?? 0,
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

export function toPeople(users: (User & { hourlyRate?: number | null })[]): PersonDTO[] {
  return users.map((u) => ({ id: u.id, name: u.name, department: u.department, active: u.active, hourlyRate: u.hourlyRate ?? 0 }));
}

export function toCampaigns(campaigns: Campaign[]): CampaignDTO[] {
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    brandId: c.brandId,
    repositoryUrl: c.repositoryUrl,
    internalDeadline: c.internalDeadline?.toISOString() ?? null,
    externalDeadline: c.externalDeadline?.toISOString() ?? null,
    budget: c.budget,
    status: c.status,
  }));
}

export function toBrands(brands: (Brand & { campaigns?: Campaign[] })[]): BrandDTO[] {
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    pocName: b.pocName,
    pocEmail: b.pocEmail,
    repositoryUrl: b.repositoryUrl,
    guidelines: b.guidelines,
    campaigns: b.campaigns ? toCampaigns(b.campaigns) : undefined,
  }));
}
