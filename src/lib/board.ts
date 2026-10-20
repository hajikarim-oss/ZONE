import type { TaskDTO } from "@/lib/dto";
import { boardColumn, type BoardKey } from "@/lib/status";

// What moving a task to a Status (board column, list or panel dropdown) changes (Asana-style drag & drop).
// Stages are worked out from the task's statuses, so a drop sets the status
// that puts the task in that column.
export function dropPatch(t: TaskDTO, to: BoardKey): Record<string, unknown> | null {
  const from = boardColumn(t);
  if (from === to) return null;
  if (to === "onhold") return { onHold: true };
  // Taking it off hold back into the column it was in before
  if (t.onHold && boardColumn({ ...t, onHold: false }) === to) return { onHold: false };
  const patch: Record<string, unknown> = t.onHold ? { onHold: false } : {};
  if (to === "upcoming") {
    if (t.editStatus !== "Not Started") patch.editStatus = "Not Started";
    if (t.shootStatus === "Footage Received" || t.shootStatus === "Done") patch.shootStatus = "Scheduled";
  }
  if (to === "ongoing") {
    if (from !== "onhold" || boardColumn({ ...t, onHold: false }) !== "ongoing") patch.editStatus = "In Progress";
  }
  if (to === "revision") {
    const sentToBrand = t.editStatus === "First Cut Sent" || t.editStatus === "In Review";
    const round = Math.min(4, Math.max(1, t.revisionRound + (sentToBrand ? 1 : 0)));
    patch.editStatus = sentToBrand ? `External Revision R${round}` : "Internal Revision R1";
  }
  if (to === "completed") {
    patch.editStatus = "Final Approved";
    patch.deliveryStatus = "Files Sent";
  }
  return Object.keys(patch).length ? patch : null;
}

