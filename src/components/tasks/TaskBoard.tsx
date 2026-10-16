"use client";

import { HardDrive, MessageSquare } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, boardStatusPatch, computeStage, type BoardKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { BrandChip, DelayBadge, DueText, PriorityPill } from "./bits";

// What dropping a card on a column changes (Asana-style drag & drop).
export function dropPatch(t: TaskDTO, to: BoardKey): Record<string, unknown> | null {
  const from = boardColumn(t);
  if (from === to) return null;
  const patch = boardStatusPatch(t, to);
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
        // Asana-style: only top-level tasks appear on the board to keep it clean
        const items = tasks.filter((t) => !t.parentId && boardColumn(t) === col.key);
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
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                    <span>{t.code}</span>
                    <span>·</span>
                    <span>{computeStage(t).label}</span>
                    {t.subtaskCount > 0 && (
                      <span className="ml-auto rounded bg-canvas px-1 py-0.5 text-[10px] text-muted">
                        ↳ {t.subtaskCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PriorityPill value={t.priority} />
                    <DelayBadge t={t} />
                    {t.storageDeviceName && (
                      <span className="inline-flex items-center gap-1 rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
                        <HardDrive className="h-2.5 w-2.5" />
                        {t.storageDeviceName}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <BrandChip name={t.brandName} color={t.brandColor} />
                    <div className="flex items-center gap-2">
                      {t.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
                          <MessageSquare className="h-3 w-3" />
                          {t.commentCount}
                        </span>
                      )}
                      <DueText date={t.internalDeadline || t.startDate} />
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
