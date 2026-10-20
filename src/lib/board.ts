import type { TaskDTO } from "@/lib/dto";
import { boardColumn, type BoardKey } from "@/lib/status";

const DELIVERED = ["Files Sent", "Invoice Raised", "Project Closed"];

// What moving a task to a Status (board column, list or panel dropdown)
// changes. The column is worked out from the task's statuses, so a move sets
// the statuses that put the task in that column — and clears the ones that
// would keep it where it was (e.g. "Files Sent" when reopening a completed task).
export function dropPatch(t: TaskDTO, to: BoardKey): Record<string, unknown> | null {
  const from = boardColumn(t);
  if (from === to) return null;
  if (to === "onhold") return { onHold: true };
  // Taking it off hold back into the column it was in before
  if (t.onHold && boardColumn({ ...t, onHold: false }) === to) return { onHold: false };

  const patch: Record<string, unknown> = t.onHold ? { onHold: false } : {};
  const reopen = () => {
    if (DELIVERED.includes(t.deliveryStatus)) patch.deliveryStatus = "Not Started";
  };
  if (to === "upcoming") {
    reopen();
    if (t.editStatus !== "Not Started") patch.editStatus = "Not Started";
    if (t.finalApproval === "Approved") patch.finalApproval = "Pending";
    if (t.shootStatus === "Footage Received" || t.shootStatus === "Done") patch.shootStatus = "Scheduled";
  }
  if (to === "ongoing") {
    reopen();
    if (from !== "onhold" || boardColumn({ ...t, onHold: false }) !== "ongoing") patch.editStatus = "In Progress";
  }
  if (to === "revision") {
    reopen();
    // Each move into Revision is a new round (R1…R4); admins hear at round 3.
    const round = Math.min(4, t.revisionRound + 1);
    patch.editStatus = `External Revision R${round}`;
    patch.revisionRound = round;
    if (t.finalApproval === "Approved") patch.finalApproval = "Pending";
  }
  if (to === "completed") {
    patch.editStatus = "Final Approved";
    patch.deliveryStatus = "Files Sent";
    patch.onHold = false;
  }
  return Object.keys(patch).length ? patch : null;
}
