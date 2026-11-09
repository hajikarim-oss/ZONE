"use client";

import { AlertCircle, CheckSquare, Clapperboard, Film, Image as ImageIcon, Minus, MoveDown, MoveUp, Video } from "lucide-react";
import { cn } from "@/lib/utils";

// Jira Issue Type Icon with Atlassian rounded colored tiles
export function JiraIssueTypeIcon({ type, className }: { type?: string | null; className?: string }) {
  const t = (type || "Deliverable").toLowerCase();

  if (t.includes("reel") || t.includes("shorts") || t.includes("video")) {
    return (
      <span
        title={type || "Video / Reel"}
        className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#0052CC] text-white shadow-xs", className)}
      >
        <Film className="h-2.5 w-2.5" />
      </span>
    );
  }

  if (t.includes("dvc") || t.includes("ad") || t.includes("film")) {
    return (
      <span
        title={type || "DVC / Commercial"}
        className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#6554C0] text-white shadow-xs", className)}
      >
        <Clapperboard className="h-2.5 w-2.5" />
      </span>
    );
  }

  if (t.includes("static") || t.includes("carousel") || t.includes("photo")) {
    return (
      <span
        title={type || "Static / Creative"}
        className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#FF8B00] text-white shadow-xs", className)}
      >
        <ImageIcon className="h-2.5 w-2.5" />
      </span>
    );
  }

  if (t.includes("revision") || t.includes("feedback") || t.includes("fix")) {
    return (
      <span
        title={type || "Revision / Feedback"}
        className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#DE350B] text-white shadow-xs", className)}
      >
        <AlertCircle className="h-2.5 w-2.5" />
      </span>
    );
  }

  return (
    <span
      title={type || "Task"}
      className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[#4C9AFF] text-white shadow-xs", className)}
    >
      <CheckSquare className="h-2.5 w-2.5" />
    </span>
  );
}

// Jira Priority Arrows (Highest, High, Medium, Low)
export function JiraPriorityIcon({ priority, className }: { priority?: string | null; className?: string }) {
  const p = (priority || "Medium").toLowerCase();

  if (p === "urgent" || p === "highest" || p === "high") {
    return (
      <span title="High Priority" className={cn("inline-flex items-center text-[#DE350B]", className)}>
        <MoveUp className="h-3.5 w-3.5 stroke-[2.5]" />
      </span>
    );
  }

  if (p === "low" || p === "lowest") {
    return (
      <span title="Low Priority" className={cn("inline-flex items-center text-[#00875A]", className)}>
        <MoveDown className="h-3.5 w-3.5 stroke-[2.5]" />
      </span>
    );
  }

  return (
    <span title="Medium Priority" className={cn("inline-flex items-center text-[#FFAB00]", className)}>
      <Minus className="h-3.5 w-3.5 stroke-[3]" />
    </span>
  );
}

// Jira Status Lozenges (TO DO, IN PROGRESS, SENT FOR APPROVAL, DONE, REOPENED)
export function JiraStatusLozenge({
  status,
  boardKey,
  className,
}: {
  status?: string | null;
  boardKey?: string;
  className?: string;
}) {
  const k = (boardKey || status || "open").toLowerCase();

  if (k === "completed" || k === "done") {
    return <span className={cn("jira-lozenge-done", className)}>DONE</span>;
  }
  if (k === "ongoing" || k === "submitted" || k === "in progress") {
    return <span className={cn("jira-lozenge-inprogress", className)}>IN PROGRESS</span>;
  }
  if (k === "approval" || k === "sent for approval" || k === "in review") {
    return <span className={cn("jira-lozenge-review", className)}>IN REVIEW</span>;
  }
  if (k === "revision" || k === "feedback" || k === "reopened") {
    return <span className={cn("jira-lozenge-feedback", className)}>FEEDBACK</span>;
  }
  return <span className={cn("jira-lozenge-todo", className)}>TO DO</span>;
}

// Jira Issue Key link badge (e.g. NODD-102)
export function JiraIssueKey({ code, onClick, className }: { code: string; onClick?: () => void; className?: string }) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "font-semibold text-[11px] text-[#0052CC] dark:text-[#4C9AFF] hover:underline tracking-tight cursor-pointer",
        className
      )}
    >
      {code}
    </span>
  );
}

// Jira Epic / Campaign rounded pill badge
export function JiraEpicPill({ name, color, className }: { name?: string | null; color?: string | null; className?: string }) {
  if (!name) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        className
      )}
      style={{
        backgroundColor: color ? `${color}20` : "#8777D920",
        color: color || "#6554C0",
        border: `1px solid ${color ? `${color}40` : "#8777D940"}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color || "#6554C0" }} />
      <span className="truncate max-w-[130px]">{name}</span>
    </span>
  );
}

