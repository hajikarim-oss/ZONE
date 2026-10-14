import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// Stable avatar colour per person, Asana-style
const AVATAR = ["#f06a6a", "#f1bd6c", "#5da283", "#4ecbc4", "#4573d2", "#8d84e8", "#e362e3", "#fd612c", "#aecf55"];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function fmtDate(d: string | Date | null | undefined, withYear = false) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "";
  return x.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function fmtDateTime(d: string | Date) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// <input type="date"> value
export function toInputDate(d: string | null | undefined) {
  if (!d) return "";
  return d.slice(0, 10);
}

export function relativeDue(d: string | null) {
  if (!d) return { text: "", tone: "none" as const };
  const due = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(due);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return { text: "Today", tone: "soon" as const };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" as const };
  if (diff < 0) return { text: fmtDate(due), tone: "late" as const };
  return { text: fmtDate(due), tone: "ok" as const };
}
