import { prisma } from "@/lib/prisma";
import { APP_URL } from "@/lib/mailer";
import { isDone, computeStage, type StatusInput } from "@/lib/status";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Google Calendar color IDs:
// 11 = Flamingo (Red - High Priority)
// 5 = Banana (Yellow - Medium Priority)
// 2 = Sage (Green - Low Priority)
// 8 = Graphite (Gray - Done/Closed)
const PRIORITY_COLORS: Record<string, string> = {
  High: "11",
  Medium: "5",
  Low: "2",
};

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      googleRefreshToken: true,
      googleAccessToken: true,
      googleTokenExpiresAt: true,
      googleCalendarSync: true,
    },
  });

  if (!user || !user.googleRefreshToken) return null;

  const now = new Date();
  // If access token exists and has more than 2 minutes of validity, use it
  if (user.googleAccessToken && user.googleTokenExpiresAt && user.googleTokenExpiresAt.getTime() > now.getTime() + 120_000) {
    return user.googleAccessToken;
  }

  // Refresh the token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: user.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[google-calendar] Failed to refresh token:", await res.text());
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = Number(data.expires_in) || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: newAccessToken,
        googleTokenExpiresAt: expiresAt,
        ...(data.refresh_token ? { googleRefreshToken: data.refresh_token } : {}),
      },
    });

    return newAccessToken;
  } catch (err) {
    console.error("[google-calendar] Refresh token exception:", err);
    return null;
  }
}

function toISODay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextDay(d: Date): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  return n;
}

function formatGCalDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(d));
}

function buildEventPayload(project: {
  id: string;
  code: string;
  title: string;
  priority: string;
  dept?: string;
  type?: string | null;
  workType?: string | null;
  briefStage?: string;
  scriptStage?: string;
  preProStage?: string;
  shootStatus?: string;
  editStatus?: string;
  revisionRound?: number;
  finalApproval?: string;
  deliveryStatus?: string;
  internalDeadline?: Date | null;
  externalDeadline?: Date | null;
  startAt?: Date | null;
  endAt?: Date | null;
  onHold?: boolean;
  context?: string | null;
  brand?: { name: string } | null;
  campaign?: { name: string } | null;
  assignee?: { name: string; email: string } | null;
  collaborators?: { name: string }[];
  storage?: { name: string; type?: string | null; location?: string | null } | null;
  subtasks?: { title: string; done: boolean; assignee?: { name: string } | null }[];
}) {
  const statusInput: StatusInput = {
    briefStage: project.briefStage || "Not Started",
    scriptStage: project.scriptStage || "Not Started",
    preProStage: project.preProStage || "Not Started",
    shootStatus: project.shootStatus || "Not Started",
    editStatus: project.editStatus || "Open",
    revisionRound: project.revisionRound ?? 0,
    finalApproval: project.finalApproval || "Pending",
    deliveryStatus: project.deliveryStatus || "Not Started",
    internalDeadline: project.internalDeadline ?? null,
    externalDeadline: project.externalDeadline ?? null,
    onHold: Boolean(project.onHold),
  };
  const done = isDone(statusInput);
  const stage = computeStage(statusInput);
  const summaryPrefix = done ? "[COMPLETED] " : "";
  const brandSuffix = project.brand?.name ? ` — ${project.brand.name}` : "";
  const summary = `${summaryPrefix}${project.code} · ${project.title}${brandSuffix}`;

  const taskUrl = `${APP_URL}/my-tasks?task=${project.id}`;

  const subtaskLines = (project.subtasks || []).map(
    (st) => `  [${st.done ? "x" : " "}] ${st.title}${st.assignee?.name ? ` (${st.assignee.name})` : ""}`
  );

  const lines = [
    `TBM POST-PRODUCTION DELIVERABLE`,
    `========================================`,
    `DELIVERABLE OVERVIEW`,
    `• Code: ${project.code}`,
    `• Title: ${project.title}`,
    `• Brand: ${project.brand?.name || "General"}`,
    project.campaign?.name ? `• Campaign: ${project.campaign.name}` : "",
    project.type || project.workType ? `• Format: ${[project.type, project.workType].filter(Boolean).join(" · ")}` : "",
    `• Priority: ${project.priority || "Medium"}`,
    `• Department: ${project.dept || "Post Production"}`,
    ``,
    `WORKFLOW & DEADLINES`,
    `• Pipeline Stage: ${stage.label}`,
    `• Edit Status: ${project.editStatus || "Open"}`,
    project.revisionRound ? `• Revision: Round ${project.revisionRound}` : "",
    project.internalDeadline ? `• Internal Studio Due: ${formatGCalDate(project.internalDeadline)}` : "",
    project.externalDeadline ? `• Client Final Delivery: ${formatGCalDate(project.externalDeadline)}` : "",
    ``,
    `TEAM & ASSIGNMENTS`,
    `• Lead Editor: ${project.assignee?.name || "Unassigned"}`,
    project.collaborators && project.collaborators.length > 0
      ? `• Collaborators: ${project.collaborators.map((c) => c.name).join(", ")}`
      : "",
    subtaskLines.length > 0
      ? `• Subtasks (${project.subtasks?.filter((s) => s.done).length}/${subtaskLines.length} done):\n${subtaskLines.join("\n")}`
      : "",
    ``,
    project.storage
      ? `ASSET STORAGE & HARD DRIVE\n• Master Drive: ${project.storage.name}${project.storage.type ? ` (${project.storage.type})` : ""}${project.storage.location ? ` [${project.storage.location}]` : ""}\n`
      : "",
    project.context?.trim()
      ? `CREATIVE BRIEF & NOTES\n${project.context.trim()}\n`
      : "",
    `========================================`,
    `STUDIO PORTAL DIRECT ACCESS:`,
    `${taskUrl}`,
  ].filter((line) => line !== null && line !== undefined);

  const description = lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");

  const colorId = done ? "8" : (PRIORITY_COLORS[project.priority] ?? "5");

  // Determine timing
  let start: Record<string, string>;
  let end: Record<string, string>;

  if (project.startAt || project.endAt) {
    const s = project.startAt ?? new Date(project.endAt!.getTime() - 3600_000);
    const e = project.endAt && project.endAt > s ? project.endAt : new Date(s.getTime() + 3600_000);
    start = { dateTime: s.toISOString(), timeZone: "Asia/Kolkata" };
    end = { dateTime: e.toISOString(), timeZone: "Asia/Kolkata" };
  } else if (project.internalDeadline) {
    const day = new Date(project.internalDeadline);
    start = { date: toISODay(day) };
    end = { date: toISODay(nextDay(day)) };
  } else {
    // If no start, end or deadline, schedule as all-day for today so it's not lost
    const today = new Date();
    start = { date: toISODay(today) };
    end = { date: toISODay(nextDay(today)) };
  }

  return {
    summary,
    description,
    colorId,
    start,
    end,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 * 24 }, // 1 day before
        { method: "popup", minutes: 60 * 2 }, // 2 hours before
      ],
    },
  };
}

export async function syncProjectToGoogleCalendar(projectId: string, targetUserId?: string): Promise<{ success: boolean; error?: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      brand: { select: { name: true } },
      campaign: { select: { name: true } },
      storage: { select: { name: true, type: true, location: true } },
      collaborators: { select: { name: true } },
      subtasks: { select: { title: true, done: true, assignee: { select: { name: true } } } },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          googleRefreshToken: true,
          googleCalendarSync: true,
        },
      },
    },
  });

  if (!project) return { success: false, error: "Task not found" };

  const syncUserId = targetUserId || project.assignee?.id;
  if (!syncUserId) return { success: false, error: "No user assigned to sync with" };

  const accessToken = await getValidAccessToken(syncUserId);
  if (!accessToken) return { success: false, error: "Not authenticated with Google Calendar or token expired" };

  const payload = buildEventPayload(project);

  try {
    if (project.googleCalendarEventId) {
      // Patch existing event
      const patchRes = await fetch(`${GOOGLE_CALENDAR_API}/${encodeURIComponent(project.googleCalendarEventId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (patchRes.ok) return { success: true };

      if (patchRes.status === 404) {
        // Event was deleted in Google Calendar, re-create it
        const createRes = await fetch(GOOGLE_CALENDAR_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (createRes.ok) {
          const created = await createRes.json();
          await prisma.project.update({
            where: { id: projectId },
            data: { googleCalendarEventId: created.id },
          });
          return { success: true };
        } else {
          const errBody = await createRes.json().catch(() => ({}));
          return { success: false, error: errBody?.error?.message || `HTTP ${createRes.status}` };
        }
      } else {
        const errBody = await patchRes.json().catch(() => ({}));
        return { success: false, error: errBody?.error?.message || `HTTP ${patchRes.status}` };
      }
    } else {
      // Create new event
      const createRes = await fetch(GOOGLE_CALENDAR_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (createRes.ok) {
        const created = await createRes.json();
        await prisma.project.update({
          where: { id: projectId },
          data: { googleCalendarEventId: created.id },
        });
        return { success: true };
      } else {
        const errBody = await createRes.json().catch(() => ({}));
        return { success: false, error: errBody?.error?.message || `HTTP ${createRes.status}` };
      }
    }
  } catch (err: any) {
    console.error(`[google-calendar] Failed to sync project ${projectId}:`, err);
    return { success: false, error: err?.message || "Network exception during sync" };
  }
}

export async function deleteProjectFromGoogleCalendar(projectId: string, explicitUserId?: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      googleCalendarEventId: true,
      assigneeId: true,
    },
  });

  if (!project || !project.googleCalendarEventId) return false;
  const targetUserId = explicitUserId || project.assigneeId;
  if (!targetUserId) return false;

  const accessToken = await getValidAccessToken(targetUserId);
  if (!accessToken) return false;

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API}/${encodeURIComponent(project.googleCalendarEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.error(`[google-calendar] Failed to delete event for project ${projectId}:`, err);
    return false;
  }
}

export type GoogleEventDTO = {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  htmlLink?: string;
};

export async function fetchGoogleCalendarEvents(
  userId: string,
  timeMin?: string,
  timeMax?: string,
): Promise<{ events: GoogleEventDTO[]; error?: string }> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { events: [], error: "Not connected to Google Calendar" };

  const now = new Date();
  const min = timeMin || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const max = timeMax || new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

  try {
    const url = new URL(GOOGLE_CALENDAR_API);
    url.searchParams.set("timeMin", min);
    url.searchParams.set("timeMax", max);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${res.status}`;
      console.error("[google-calendar] Failed to fetch events:", msg);
      return { events: [], error: msg };
    }

    const data = await res.json();
    const events: GoogleEventDTO[] = (data.items || []).map((item: any) => ({
      id: item.id,
      summary: item.summary || "(No title)",
      description: item.description,
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      isAllDay: Boolean(item.start?.date && !item.start?.dateTime),
      htmlLink: item.htmlLink,
    }));

    return { events };
  } catch (err: any) {
    console.error("[google-calendar] Exception fetching events:", err);
    return { events: [], error: err?.message || "Failed to fetch events" };
  }
}

export async function syncAllUserTasksToGoogleCalendar(userId: string): Promise<{ synced: number; total: number; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, googleRefreshToken: true, googleCalendarSync: true },
  });

  if (!user || !user.googleRefreshToken) {
    throw new Error("Google Calendar is not connected. Please connect your Google account with Calendar permissions.");
  }

  // Ensure sync is enabled
  if (!user.googleCalendarSync) {
    await prisma.user.update({
      where: { id: userId },
      data: { googleCalendarSync: true },
    });
  }

  // Find all active / relevant tasks for this user (assigned, created, or collaborating)
  const tasks = await prisma.project.findMany({
    where: {
      archived: false,
      OR: [
        { assigneeId: userId },
        { createdById: userId },
        { collaborators: { some: { id: userId } } },
      ],
    },
    select: { id: true },
  });

  let synced = 0;
  let lastError: string | undefined;
  for (const t of tasks) {
    const res = await syncProjectToGoogleCalendar(t.id, userId);
    if (res.success) {
      synced++;
    } else if (res.error && !lastError) {
      lastError = res.error;
    }
  }

  return { synced, total: tasks.length, error: lastError };
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleCalendarSync: false,
      googleRefreshToken: null,
      googleAccessToken: null,
      googleTokenExpiresAt: null,
    },
  });
}
