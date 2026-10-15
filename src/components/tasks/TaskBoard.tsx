"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, computeStage, type BoardKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { BrandChip, DelayBadge, DueText, PriorityPill } from "./bits";

// What dropping a card on a column changes (Asana-style drag & drop).
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

export default function TaskBoard({
  tasks,
  selectedId,
  showAssignee,
  onOpen,
  onMove,
}: {
  tasks: TaskDTO[];
  selectedId: string | null;
  showAssignee: boolean;
  onOpen: (id: string) => void;
  onMove: (task: TaskDTO, to: BoardKey) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardKey | null>(null);

  return (
    <div className="flex h-full gap-3 pb-4">
      {BOARD_COLUMNS.map((col) => {
        const items = tasks.filter((t) => boardColumn(t) === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const t = tasks.find((x) => x.id === dragId);
              setDragId(null);
              setOver(null);
              if (t) onMove(t, col.key);
            }}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg bg-canvas transition-colors",
              over === col.key && "bg-accent-soft ring-2 ring-accent/40",
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold" title={col.hint}>
              <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
              {col.label}
              <span className="font-normal text-muted">{items.length}</span>
            </div>
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => onOpen(t.id)}
                  className={cn(
                    "block w-full cursor-grab rounded-lg border bg-surface p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-muted/40 active:cursor-grabbing",
                    selectedId === t.id ? "border-accent" : "border-line",
                    dragId === t.id && "opacity-50",
                  )}
                >
                  <div className="text-[13px] leading-snug">{t.title}</div>
                  <div className="mt-1 text-[11px] text-muted">{t.code} · {computeStage(t).label}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PriorityPill value={t.priority} />
                    <DelayBadge t={t} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <BrandChip name={t.brandName} color={t.brandColor} />
                    <div className="flex items-center gap-2">
                      <DueText date={t.internalDeadline} />
                      {showAssignee && t.assigneeName && <Avatar name={t.assigneeName} size={22} />}
                      {t.collaborators.length > 0 && (
                        <span className="text-[11px] text-muted" title={t.collaborators.map((c) => c.name).join(", ")}>
                          +{t.collaborators.length}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">
                  {dragId ? "Drop here" : "Nothing here"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
