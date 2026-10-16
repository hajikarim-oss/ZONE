import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTask, addAttachment, createStorageDevice } from "@/lib/actions";
import { PRIORITIES } from "@/lib/constants";

// Integration endpoint for Zapier, Make, N8N, Slack, and Email-to-task extensions.
// Authenticated via Authorization header (Bearer <key>), x-api-key header, or ?apiKey= query param.
export async function POST(req: NextRequest) {
  try {
    const apiKey =
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      req.nextUrl.searchParams.get("apiKey");

    const expectedKey = process.env.INTEGRATION_API_KEY || process.env.NEXTAUTH_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      return NextResponse.json({ ok: false, error: "Unauthorized. Invalid or missing API key." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Auto-populate task header / title from email subject, Slack message text, or title
    const rawTitle = body.title || body.subject || body.header || body.summary || body.text;
    if (!rawTitle || typeof rawTitle !== "string") {
      return NextResponse.json(
        { ok: false, error: "Title or subject is required to create a task." },
        { status: 400 },
      );
    }
    // Clean up subject lines like "Fwd: [Brief] Video for Unseen Man" -> "Video for Unseen Man"
    const cleanTitle = rawTitle.replace(/^(re|fwd|fw):\s*/i, "").trim().slice(0, 200);

    // Auto-populate description / brief from email body or Slack context
    const description = (body.description || body.brief || body.body || body.context || body.notes || "").trim();

    // Match or find brand (e.g. "Unseen Man")
    let brandId: string | null = null;
    const brandInput = (body.brandName || body.brand || body.brandId || "").trim();
    if (brandInput) {
      const brand = await prisma.brand.findFirst({
        where: {
          OR: [
            { id: brandInput },
            { name: { equals: brandInput, mode: "insensitive" } },
            { name: { contains: brandInput, mode: "insensitive" } },
          ],
        },
      });
      if (brand) brandId = brand.id;
    }

    // Match or find assignee by email or name
    let assigneeId: string | null = null;
    const assigneeInput = (body.assigneeEmail || body.assignee || body.assigneeId || body.assigneeName || "").trim();
    if (assigneeInput) {
      const user = await prisma.user.findFirst({
        where: {
          active: true,
          OR: [
            { id: assigneeInput },
            { email: { equals: assigneeInput, mode: "insensitive" } },
            { name: { equals: assigneeInput, mode: "insensitive" } },
          ],
        },
      });
      if (user) assigneeId = user.id;
    }

    // Match or create storage device if provided
    let storageDeviceId: string | null = null;
    const storageInput = (body.storageName || body.storage || body.storageDevice || "").trim();
    if (storageInput) {
      let storage = await prisma.storageDevice.findFirst({
        where: { name: { equals: storageInput, mode: "insensitive" } },
      });
      if (!storage) {
        storage = await prisma.storageDevice.create({ data: { name: storageInput } });
      }
      storageDeviceId = storage.id;
    }

    // Priority
    const priority = PRIORITIES.includes(body.priority) ? body.priority : "Medium";

    // Three dates: Start date, End date, Due date
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const internalDeadline = (body.endDate || body.internalDeadline) ? new Date(body.endDate || body.internalDeadline) : null;
    const externalDeadline = (body.dueDate || body.externalDeadline) ? new Date(body.dueDate || body.externalDeadline) : null;

    // Generate unique code
    const rows = await prisma.project.findMany({ select: { code: true } });
    let max = 0;
    for (const r of rows) {
      const n = Number(r.code.match(/^TBM-(\d+)/)?.[1] ?? 0);
      if (n > max) max = n;
    }
    const code = `TBM-${String(max + 1).padStart(3, "0")}`;

    // Create the task
    const project = await prisma.project.create({
      data: {
        code,
        title: cleanTitle,
        context: description || null,
        brandId,
        assigneeId,
        storageDeviceId,
        priority,
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : null,
        internalDeadline: internalDeadline && !isNaN(internalDeadline.getTime()) ? internalDeadline : null,
        externalDeadline: externalDeadline && !isNaN(externalDeadline.getTime()) ? externalDeadline : null,
        lastTeamUpdateAt: new Date(),
      },
      include: {
        brand: true,
        assignee: true,
        storageDevice: true,
      },
    });

    // Auto-attach Drive links or uploaded URLs if provided
    const driveUrl = body.driveUrl || body.attachmentUrl || body.fileUrl || body.attachment;
    if (driveUrl && typeof driveUrl === "string" && driveUrl.trim()) {
      await prisma.attachment.create({
        data: {
          projectId: project.id,
          url: driveUrl.trim(),
          label: body.attachmentLabel || (driveUrl.includes("drive.google.com") ? "Google Drive Files" : "Attachment"),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      task: {
        id: project.id,
        code: project.code,
        title: project.title,
        brandName: project.brand?.name ?? null,
        assigneeName: project.assignee?.name ?? null,
        storageName: project.storageDevice?.name ?? null,
        priority: project.priority,
        startDate: project.startDate?.toISOString() ?? null,
        endDate: project.internalDeadline?.toISOString() ?? null,
        dueDate: project.externalDeadline?.toISOString() ?? null,
      },
    });
  } catch (error: any) {
    console.error("[integrations/task] Error creating task:", error);
    return NextResponse.json({ ok: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}

// GET endpoint to return integration docs / schema for Zapier/N8N
export async function GET() {
  return NextResponse.json({
    name: "TBM Task Integration Endpoint",
    description: "Create tasks directly from Email, Slack, Zapier, Make, or N8N",
    method: "POST",
    headers: {
      "Authorization": "Bearer <API_KEY>",
      "Content-Type": "application/json",
    },
    payloadFields: {
      title: "string (required) - Task name or email subject",
      description: "string (optional) - Task brief / email body",
      brandName: "string (optional) - Brand name e.g. Unseen Man",
      assigneeEmail: "string (optional) - Teammate email to assign task",
      storageName: "string (optional) - Storage device or drive name",
      priority: "High | Medium | Low (default: Medium)",
      startDate: "ISO date string (optional)",
      endDate: "ISO date string (optional)",
      dueDate: "ISO date string (optional)",
      driveUrl: "string (optional) - Google Drive link or file URL",
    },
  });
}
