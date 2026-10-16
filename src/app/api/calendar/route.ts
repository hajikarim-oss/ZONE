import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDone } from "@/lib/status";
import { APP_URL } from "@/lib/mailer";

// Formats a Date to iCalendar UTC string format: YYYYMMDDTHHMMSSZ
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Google Calendar iCal feed for tasks and deadlines
export async function GET(req: NextRequest) {
  try {
    const userEmail = req.nextUrl.searchParams.get("email");
    const brandId = req.nextUrl.searchParams.get("brandId");

    const where: any = { archived: false };
    if (userEmail) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } });
      if (user) {
        where.OR = [
          { assigneeId: user.id },
          { createdById: user.id },
          { collaborators: { some: { id: user.id } } },
        ];
      }
    }
    if (brandId) {
      where.brandId = brandId;
    }

    const tasks = await prisma.project.findMany({
      where,
      include: {
        brand: true,
        assignee: true,
      },
    });

    const activeTasks = tasks.filter((t) => !isDone(t));

    // Build iCalendar string
    let ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//The Bored Monkey//TBM Post Production//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:TBM Post Production Tasks",
      "X-WR-TIMEZONE:Asia/Kolkata",
    ];

    for (const t of activeTasks) {
      const start = t.startDate || t.internalDeadline || t.createdAt;
      const end = t.internalDeadline || t.externalDeadline || new Date(start.getTime() + 3600000);

      const summary = `[${t.code}] ${t.title}${t.brand ? ` (${t.brand.name})` : ""}`;
      const description = [
        `Task: ${t.title}`,
        `Brand: ${t.brand?.name ?? "None"}`,
        `Assignee: ${t.assignee?.name ?? "Unassigned"}`,
        `Priority: ${t.priority}`,
        `Edit Status: ${t.editStatus}`,
        t.context ? `Context: ${t.context}` : "",
        `Link: ${APP_URL}/my-tasks?task=${t.id}`,
      ]
        .filter(Boolean)
        .join("\\n");

      ics.push(
        "BEGIN:VEVENT",
        `UID:tbm-${t.id}@theboredmonkey.com`,
        `DTSTAMP:${toICSDate(new Date())}`,
        `DTSTART:${toICSDate(start)}`,
        `DTEND:${toICSDate(end)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `URL:${APP_URL}/my-tasks?task=${t.id}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      );
    }

    ics.push("END:VCALENDAR");

    return new Response(ics.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="tbm-tasks.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("[calendar] Error generating feed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
