"use client";

export type ActiveSession = {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  brandName?: string | null;
  campaignName?: string | null;
  workType?: string | null;
  startedAt: number; // timestamp in ms
};

const STORAGE_KEY = "tbm_active_session";

export function getActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.taskId && parsed.startedAt) return parsed;
  } catch {}
  return null;
}

export function setActiveSession(session: ActiveSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event("tbm_session_change"));
  } catch {}
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

