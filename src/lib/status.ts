// Pure status logic — the "Overall Status (auto)" column, the dashboard's
// editor-delay vs brand-delay split and the team capacity column, ported
// from the Master sheet. No DB access here so it can run on server or client.

export type StageKey =
  | "awaiting"
  | "preprod"
  | "shoot"
  | "editing"
  | "review"
  | "revision"
  | "approved"
  | "delivered"
  | "closed"
  | "onhold";

export const STAGE_GROUPS: { key: StageKey; label: string; dot: string }[] = [
  { key: "awaiting", label: "Awaiting brief", dot: "#a2a0a2" },
  { key: "preprod", label: "Pre-production", dot: "#8d84e8" },
  { key: "shoot", label: "Shoot", dot: "#4573d2" },
  { key: "editing", label: "Editing", dot: "#f1bd6c" },
  { key: "review", label: "In review", dot: "#e8384f" },
  { key: "revision", label: "Revisions", dot: "#fd612c" },
  { key: "approved", label: "Approved", dot: "#5da283" },
  { key: "delivered", label: "Delivered", dot: "#4ecbc4" },
  { key: "closed", label: "Closed", dot: "#6d6e6f" },
  { key: "onhold", label: "On hold", dot: "#b8a28c" },
];

// The five board columns (Asana-style), each covering one or more stages.
export type BoardKey = "upcoming" | "ongoing" | "revision" | "onhold" | "completed";
export const BOARD_COLUMNS: { key: BoardKey; label: string; dot: string; stages: StageKey[]; hint: string }[] = [
  { key: "upcoming", label: "Upcoming", dot: "#8d84e8", stages: ["awaiting", "preprod", "shoot"], hint: "Brief, script, pre-production or shoot — editing hasn't started" },
  { key: "ongoing", label: "Ongoing", dot: "#f1bd6c", stages: ["editing", "review", "approved"], hint: "Being edited, with the brand for review, or approved and awaiting delivery" },
  { key: "revision", label: "Revision", dot: "#fd612c", stages: ["revision"], hint: "Internal or external revisions" },
  { key: "onhold", label: "On hold", dot: "#b8a28c", stages: ["onhold"], hint: "Paused" },
  { key: "completed", label: "Completed", dot: "#5da283", stages: ["delivered", "closed"], hint: "Delivered or closed" },
];

export function boardColumn(p: StatusInput): BoardKey {
  const k = computeStage(p).key;
  return BOARD_COLUMNS.find((c) => c.stages.includes(k))?.key ?? "upcoming";
}

export type StatusInput = {
  briefStage: string;
  scriptStage: string;
  preProStage: string;
  shootStatus: string;
  editStatus: string;
  revisionRound: number;
  finalApproval: string;
  deliveryStatus: string;
  externalDeadline: Date | string | null;
  internalDeadline: Date | string | null;
  onHold?: boolean;
};

export type Stage = { key: StageKey; label: string };

export function computeStage(p: StatusInput): Stage {
  if (p.deliveryStatus === "Project Closed") return { key: "closed", label: "Closed" };
  if (p.deliveryStatus === "Files Sent" || p.deliveryStatus === "Invoice Raised")
    return { key: "delivered", label: "Delivered" };
  if (p.onHold) return { key: "onhold", label: "On hold" };
  if (p.editStatus === "Final Approved" || p.finalApproval === "Approved")
    return { key: "approved", label: "Final approved" };

  const ext = p.editStatus.match(/^External Revision R(\d)/);
  if (ext) return { key: "revision", label: `Ext revision R${ext[1]}` };
  const int = p.editStatus.match(/^Internal Revision R(\d)/);
  if (int) return { key: "revision", label: `Int revision R${int[1]}` };
  if (p.editStatus === "In Review") return { key: "review", label: "In review" };
  if (p.editStatus === "First Cut Sent") return { key: "review", label: "First cut sent" };
  if (p.editStatus === "First Cut Ready") return { key: "editing", label: "First cut ready" };
  if (p.editStatus === "In Progress") return { key: "editing", label: "Editing" };

  if (p.shootStatus === "Footage Received" || p.shootStatus === "Done")
    return { key: "editing", label: "Footage ready" };
  if (p.shootStatus === "Scheduled") return { key: "shoot", label: "Shoot scheduled" };
  if (p.preProStage === "In Progress" || p.preProStage === "Complete" || p.scriptStage === "Approved")
    return { key: "preprod", label: "Pre-production" };
  if (p.scriptStage === "In Progress" || p.scriptStage === "Sent to Client")
    return { key: "preprod", label: p.scriptStage === "Sent to Client" ? "Script with client" : "Scripting" };
  if (p.briefStage === "Brief Received" || p.briefStage === "Brief Call Done")
    return { key: "preprod", label: "Brief received" };
  return { key: "awaiting", label: "Awaiting brief" };
}

export function isDone(p: StatusInput) {
  const k = computeStage(p).key;
  return k === "delivered" || k === "closed";
}

// Who is the project waiting on right now? A cut that's been sent / is in
// review, or approved but awaiting the brand's sign-off, is with the brand.
// Everything else is on the team.
export function waitingOn(p: StatusInput): "TEAM" | "BRAND" | null {
  if (isDone(p) || p.onHold) return null;
  if (p.editStatus === "First Cut Sent" || p.editStatus === "In Review") return "BRAND";
  if (p.editStatus === "Final Approved" && p.finalApproval !== "Approved") return "BRAND";
  return "TEAM";
}

function toDate(d: Date | string | null): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return isNaN(x.getTime()) ? null : x;
}

export function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((startOfToday(b).getTime() - startOfToday(a).getTime()) / 86_400_000);
}

export type Delay = { who: "EDITOR" | "BRAND"; days: number; overdue: boolean } | null;

// Same split the sheet dashboard draws: editor delay = past the internal
// deadline while the ball is in the team's court; brand delay = past the
// external deadline while waiting on the brand. Overdue = past the external
// deadline and not delivered, whoever's fault it is.
export function computeDelay(p: StatusInput, now = new Date()): Delay {
  if (isDone(p) || p.onHold) return null;
  const today = startOfToday(now);
  const intDl = toDate(p.internalDeadline);
  const extDl = toDate(p.externalDeadline);
  const overdue = !!extDl && extDl < today;
  const w = waitingOn(p);
  if (w === "BRAND") {
    const ref = extDl ?? intDl;
    if (ref && ref < today) return { who: "BRAND", days: daysBetween(ref, today), overdue };
    return null;
  }
  const ref = intDl ?? extDl;
  if (ref && ref < today) return { who: "EDITOR", days: daysBetween(ref, today), overdue };
  return null;
}

export type Capacity = "Available" | "Busy" | "Overloaded";
export function capacityFor(activeCount: number): Capacity {
  if (activeCount === 0) return "Available";
  if (activeCount >= 5) return "Overloaded";
  return "Busy";
}

// Client-facing wording (old brand sheet): friendly, no internal stages.
export function clientStatus(p: StatusInput): string {
  const s = computeStage(p);
  switch (s.key) {
    case "awaiting":
      return "Brief in progress";
    case "preprod":
      return "Pre-production";
    case "shoot":
      return "Shoot scheduled";
    case "editing":
      return "Being edited";
    case "review":
      return "Ready for your review";
    case "revision":
      return p.editStatus.startsWith("External") ? "Working on your feedback" : "Being refined";
    case "approved":
      return "Approved";
    case "delivered":
      return "Delivered";
    case "closed":
      return "Completed";
    case "onhold":
      return "On hold";
  }
}

export function priorityColor(p: string) {
  if (p === "High") return { bg: "#ffe4e6", fg: "#be123c" };
  if (p === "Low") return { bg: "#dcfce7", fg: "#15803d" };
  return { bg: "#fef3c7", fg: "#b45309" };
}
