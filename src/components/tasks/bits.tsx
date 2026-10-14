"use client";

import { computeStage, computeDelay, priorityColor, STAGE_GROUPS } from "@/lib/status";
import type { TaskDTO } from "@/lib/dto";
import { cn, relativeDue } from "@/lib/utils";

export function StagePill({ t, className }: { t: TaskDTO; className?: string }) {
  const s = computeStage(t);
  const g = STAGE_GROUPS.find((x) => x.key === s.key)!;
  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[12px] font-medium text-ink", className)}
      style={{ background: g.dot + "2b" }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.dot }} />
      <span className="truncate">{s.label}</span>
    </span>
  );
}

export function PriorityPill({ value }: { value: string }) {
  const c = priorityColor(value);
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: c.bg, color: c.fg }}>
      {value}
    </span>
  );
}

export function DueText({ date, done }: { date: string | null; done?: boolean }) {
  const r = relativeDue(date);
  if (!r.text) return <span className="text-[13px] text-muted/60">—</span>;
  return (
    <span
      className={cn(
        "text-[13px]",
        done ? "text-muted" : r.tone === "late" ? "text-rose-600" : r.tone === "soon" ? "text-emerald-700" : "text-ink",
      )}
    >
      {r.text}
    </span>
  );
}

export function DelayBadge({ t }: { t: TaskDTO }) {
  const d = computeDelay(t);
  if (!d) return null;
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        d.who === "EDITOR" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700",
      )}
      title={`${d.days} day(s) past deadline`}
    >
      {d.who === "EDITOR" ? "Team late" : "Waiting on brand"} · {d.days}d
    </span>
  );
}

export function BrandChip({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className="text-[13px] text-muted/60">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate text-[13px]">
      <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: color ?? "#5b3fd1" }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// Select that looks like plain text until hovered (inline table editing)
export function CellSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = "—",
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={cn("cell-select truncate", !value && "text-muted/60", className)}
    >
      {!options.some((o) => o.value === value) && <option value={value}>{value || placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const opts = (xs: readonly (string | number)[]) => xs.map((x) => ({ value: String(x), label: String(x) }));
