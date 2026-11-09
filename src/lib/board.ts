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
    if (t.finalApproval === "Approved") patch.finalApproval = "Pending";
  };

  if (to === "open" || to === "upcoming") {
    reopen();
    if (t.editStatus !== "Not Started") patch.editStatus = "Not Started";
    if (t.shootStatus === "Footage Received" || t.shootStatus === "Done") patch.shootStatus = "Scheduled";
  } else if (to === "submitted" || to === "ongoing") {
    reopen();
    patch.editStatus = "In Progress";
  } else if (to === "approval") {
    reopen();
    patch.editStatus = "First Cut Sent";
    patch.clientReview = "Pending";
  } else if (to === "feedback" || to === "revision") {
    reopen();
    // Each move into Revision/Feedback is a new round (R1…R4); admins hear at round 3.
    const round = Math.min(4, Math.max(1, t.revisionRound + 1));
    patch.editStatus = `External Revision R${round}`;
    patch.revisionRound = round;
  } else if (to === "done" || to === "completed") {
    // Permanent completed state: sets both final approval AND delivery
    patch.editStatus = "Final Approved";
    patch.finalApproval = "Approved";
    patch.deliveryStatus = "Files Sent";
    patch.onHold = false;
  } else if (to === "reopened") {
    // Client changes their mind after final approval
    patch.editStatus = "Reopened";
    patch.finalApproval = "Pending";
    patch.deliveryStatus = "Not Started";
    patch.clientReview = "Pending";
    patch.onHold = false;
  }
  return Object.keys(patch).length ? patch : null;
}
