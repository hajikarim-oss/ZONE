import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_URL } from "@/lib/mailer";
import { verifyFeedKey } from "@/lib/feeds";
import { myTasksFilter } from "@/lib/rbac";
import { isDone } from "@/lib/status";

// Personal calendar feed (iCal) of someone's My tasks, for Google Calendar /
// Outlook / Apple Calendar → "Subscribe from URL". The link is personal and
// signed: /api/calendar?u=<userId>&k=<key> (shown on the My tasks page).
// Tasks with Start / End times appear at those times; otherwise on the Due date.

const toICS = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const toICSDay = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// iCal lines must be folded at 75 octets
const fold = (line: string) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const k = req.nextUrl.searchParams.get("k") ?? "";
  if (!u || !verifyFeedKey(u, k)) return NextResponse.json({ ok: false, error: "Invalid calendar link" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: u } });
  if (!user || !user.active) return NextResponse.json({ ok: false, error: "Invalid calendar link" }, { status: 401 });
  const seeAll = user.role === "ADMIN" || user.role === "MANAGER";

  const tasks = await prisma.project.findMany({
    where: { archived: false, ...myTasksFilter(user.id) },
    include: { brand: true, assignee: true, subtasks: { where: { assigneeId: user.id, done: false } } },
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Bored Monkey//Post Prod Panel//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`TBM tasks · ${user.name}`)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  const stamp = toICS(new Date());

  for (const t of tasks) {
    if (isDone(t)) continue;
    const link = `${APP_URL}/${seeAll ? "projects" : "my-tasks"}?task=${t.id}`;
    const desc = [
      `${t.code} · ${t.title}`,
      `Brand: ${t.brand?.name ?? "—"}`,
      `Assignee: ${t.assignee?.name ?? "Unassigned"}`,
      `Priority: ${t.priority}`,
      `Edit status: ${t.editStatus}`,
      t.internalDeadline ? `Due: ${t.internalDeadline.toISOString().slice(0, 10)}` : "",
      seeAll && t.externalDeadline ? `Client deadline: ${t.externalDeadline.toISOString().slice(0, 10)}` : "",
      t.context ? `\n${t.context}` : "",
      `\nOpen: ${link}`,
    ].filter(Boolean).join("\n");
    const summary = `${t.title}${t.brand ? ` (${t.brand.name})` : ""}`;

    if (t.startAt || t.endAt) {
      const start = t.startAt ?? new Date(t.endAt!.getTime() - 3600_000);
      const end = t.endAt && t.endAt > start ? t.endAt : new Date(start.getTime() + 3600_000);
      lines.push("BEGIN:VEVENT", `UID:tbm-work-${t.id}@post-prod`, `DTSTAMP:${stamp}`, `DTSTART:${toICS(start)}`, `DTEND:${toICS(end)}`,
        fold(`SUMMARY:${esc(summary)}`), fold(`DESCRIPTION:${esc(desc)}`), fold(`URL:${link}`), "END:VEVENT");
    }
    if (t.internalDeadline) {
      const day = new Date(t.internalDeadline);
      const next = new Date(day.getTime() + 86_400_000);
      lines.push("BEGIN:VEVENT", `UID:tbm-due-${t.id}@post-prod`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${toICSDay(day)}`, `DTEND;VALUE=DATE:${toICSDay(next)}`,
        fold(`SUMMARY:${esc(`Due: ${summary}`)}`), fold(`DESCRIPTION:${esc(desc)}`), fold(`URL:${link}`), "END:VEVENT");
    }
    for (const s of t.subtasks) {
      if (!s.dueDate) continue;
      const next = new Date(s.dueDate.getTime() + 86_400_000);
      lines.push("BEGIN:VEVENT", `UID:tbm-sub-${s.id}@post-prod`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${toICSDay(s.dueDate)}`, `DTEND;VALUE=DATE:${toICSDay(next)}`,
        fold(`SUMMARY:${esc(`Subtask: ${s.title} · ${t.title}`)}`), fold(`URL:${link}`), "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tbm-tasks.ics"',
      "Cache-Control": "no-store",
    },
  });
}
