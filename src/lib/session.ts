"use client";

export const STANDARD_SESSION_LIMIT_SECONDS = 4 * 3600; // 4 hours standard continuous block
export const MAX_SESSION_LIMIT_SECONDS = 8 * 3600; // 8 hours maximum shift cap
export const SESSION_GRACE_SECONDS = 15 * 60; // 15 minutes grace before auto-stop

export type ActiveSession = {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  brandName?: string | null;
  campaignName?: string | null;
  workType?: string | null;
  startedAt: number; // timestamp in ms
  limitSeconds?: number; // standard limit + any granted extensions
  extensionsCount?: number;
};

const STORAGE_KEY = "tbm_active_session";

export function getActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.taskId && parsed.startedAt) {
      return {
        ...parsed,
        limitSeconds: parsed.limitSeconds ?? STANDARD_SESSION_LIMIT_SECONDS,
        extensionsCount: parsed.extensionsCount ?? 0,
      };
    }
  } catch {}
  return null;
}

export function setActiveSession(session: ActiveSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      const normalized: ActiveSession = {
        ...session,
        limitSeconds: session.limitSeconds ?? STANDARD_SESSION_LIMIT_SECONDS,
        extensionsCount: session.extensionsCount ?? 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event("tbm_session_change"));
  } catch {}
}

export function extendActiveSession(extraHours: number): ActiveSession | null {
  const current = getActiveSession();
  if (!current) return null;
  const currentLimit = current.limitSeconds ?? STANDARD_SESSION_LIMIT_SECONDS;
  const nextLimit = Math.min(MAX_SESSION_LIMIT_SECONDS, currentLimit + Math.round(extraHours * 3600));
  const updated: ActiveSession = {
    ...current,
    limitSeconds: nextLimit,
    extensionsCount: (current.extensionsCount ?? 0) + 1,
  };
  setActiveSession(updated);
  return updated;
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

