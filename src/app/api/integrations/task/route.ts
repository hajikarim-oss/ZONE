import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRIORITIES } from "@/lib/constants";
import { sameKey } from "@/lib/feeds";
import { onAssigned } from "@/lib/notify";

// Create a task from n8n, Zapier, Make, an email or a Slack message.
// Auth: header  Authorization: Bearer <INTEGRATION_API_KEY>  (or x-api-key).
// Set INTEGRATION_API_KEY in .env / Vercel to turn this on.

const when = (v: unknown) => {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const str = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};

export async function POST(req: NextRequest) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) return NextResponse.json({ ok: false, error: "Integrations are off. Set INTEGRATION_API_KEY first." }, { status: 503 });
  const given = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!sameKey(given, expected)) return NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Title from the email subject / Slack message; "Fwd: Re:" prefixes removed
    const rawTitle = str(body.title, body.subject, body.header, body.summary, body.text);
    if (!rawTitle) return NextResponse.json({ ok: false, error: "title (or subject) is required" }, { status: 400 });
    const title = rawTitle.replace(/^((re|fwd?|fw)\s*:\s*)+/i, "").trim().slice(0, 200);
    const description = str(body.description, body.brief, body.body, body.context, body.notes).slice(0, 10_000);

    // Brand by name or id (e.g. "Unseen Man")
    const brandIn = str(body.brandName, body.brand, body.brandId);
    const brand = brandIn
      ? await prisma.brand.findFirst({
          where: { OR: [{ id: brandIn }, { name: { equals: brandIn, mode: "insensitive" } }] },
        })
      : null;

    // Assignee by email, name or id
    const personIn = str(body.assigneeEmail, body.assignee, body.assigneeName, body.assigneeId);
    const assignee = personIn
      ? await prisma.user.findFirst({
          where: { active: true, OR: [{ id: personIn }, { email: { equals: personIn, mode: "insensitive" } }, { name: { equals: personIn, mode: "insensitive" } }] },
        })
      : null;

    // Storage by name (created if new)
    const storageIn = str(body.storageName, body.storage);
    let storageId: string | null = null;
    if (storageIn) {
      const s =
        (await prisma.storage.findFirst({ where: { name: { equals: storageIn, mode: "insensitive" } } })) ??
        (await prisma.storage.create({ data: { name: storageIn } }));
      storageId = s.id;
    }

    // Start / End (date + time), Due date, optional client deadline
    const priority = (PRIORITIES as readonly string[]).includes(String(body.priority)) ? String(body.priority) : "Medium";
    const codes = await prisma.project.findMany({ select: { code: true } });
    const max = codes.reduce((m, r) => Math.max(m, Number(r.code.match(/^TBM-(\d+)/)?.[1] ?? 0)), 0);
    const source = str(body.source) || "Integration";

    const p = await prisma.project.create({
      data: {
        code: `TBM-${String(max + 1).padStart(3, "0")}`,
        title,
        context: description || null,
        brandId: brand?.id ?? null,
        assigneeId: assignee?.id ?? null,
        storageId,
        priority,
        startAt: when(body.startAt ?? body.startDate),
        endAt: when(body.endAt ?? body.endDate),
        internalDeadline: when(body.dueDate ?? body.due),
        externalDeadline: when(body.clientDeadline),
        lastTeamUpdateAt: new Date(),
      },
      include: { brand: true, assignee: true, storage: true },
    });

    // Optional link(s): Drive file, email permalink, Slack message link…
    const links = [body.driveUrl, body.attachmentUrl, body.fileUrl, body.link, ...(Array.isArray(body.links) ? body.links : [])]
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u.trim()))
      .slice(0, 20);
    if (links.length)
      await prisma.attachment.createMany({
        data: links.map((url) => ({
          projectId: p.id,
          url: url.trim(),
          name: str(body.attachmentName) || (url.includes("drive.google.com") ? "Google Drive" : url.includes("slack.com") ? "Slack message" : url.includes("mail.google.com") ? "Email" : "Link"),
          addedByName: source,
        })),
      });

    await prisma.activity.create({ data: { projectId: p.id, actorName: source, field: "Created", toValue: p.title } });
    if (p.assignee) await onAssigned(p);

    return NextResponse.json({
      ok: true,
      task: {
        id: p.id,
        code: p.code,
        title: p.title,
        brand: p.brand?.name ?? null,
        assignee: p.assignee?.name ?? null,
        storage: p.storage?.name ?? null,
        priority: p.priority,
        startAt: p.startAt?.toISOString() ?? null,
        endAt: p.endAt?.toISOString() ?? null,
        dueDate: p.internalDeadline?.toISOString() ?? null,
        attachments: links.length,
      },
      unmatched: {
        ...(brandIn && !brand ? { brand: brandIn } : {}),
        ...(personIn && !assignee ? { assignee: personIn } : {}),
      },
    });
  } catch (e) {
    console.error("[integrations/task]", e);
    return NextResponse.json({ ok: false, error: "Couldn't create the task" }, { status: 500 });
  }
}

// Field reference for setting up n8n / Zapier / Make
export async function GET() {
  return NextResponse.json({
    name: "TBM Post Prod Panel: create task",
    method: "POST",
    headers: { Authorization: "Bearer <INTEGRATION_API_KEY>", "Content-Type": "application/json" },
    fields: {
      title: "required: task name (or 'subject' from an email, 'text' from Slack)",
      description: "brief / email body",
      brandName: "e.g. Unseen Man (must match a brand)",
      assigneeEmail: "teammate's email (or assigneeName)",
      priority: "High | Medium | Low",
      startAt: "ISO date-time, e.g. 2026-10-21T10:00:00+05:30",
      endAt: "ISO date-time",
      dueDate: "ISO date, e.g. 2026-10-25",
      clientDeadline: "ISO date (admins only see this)",
      storageName: "hard drive / folder (created if new)",
      driveUrl: "a link to attach (or 'links': [..])",
      source: "shown in history, e.g. 'n8n', 'Gmail', 'Slack'",
    },
  });
}
