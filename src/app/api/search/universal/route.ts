import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import rawStorageData from "@/data/storage-management.json";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  // 1. Storage items from sheet (Drives & Files)
  const allStorage = (rawStorageData as any[]) || [];
  const storageItems = q
    ? allStorage.filter((item) => {
        const task = (item.task || "").toLowerCase();
        const drive = (item.storageName || "").toLowerCase();
        const loc = (item.dataLocation || "").toLowerCase();
        const reviewer = (item.reviewer || "").toLowerCase();
        return task.includes(q) || drive.includes(q) || loc.includes(q) || reviewer.includes(q);
      }).slice(0, 15)
    : allStorage.slice(0, 8);

  // 2. Projects / Deliverables
  const projectWhere = q
    ? {
        archived: false,
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } },
          { context: { contains: q, mode: "insensitive" as const } },
          { notes: { contains: q, mode: "insensitive" as const } },
          { brand: { name: { contains: q, mode: "insensitive" as const } } },
          { assignee: { name: { contains: q, mode: "insensitive" as const } } },
          { subtasks: { some: { title: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : { archived: false };

  const [projects, brands, people] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      take: q ? 15 : 8,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        editStatus: true,
        deliveryStatus: true,
        internalDeadline: true,
        brand: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.brand.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      take: 8,
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { projects: true } } },
    }),
    prisma.user.findMany({
      where: q
        ? {
            active: true,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } },
            ],
          }
        : { active: true },
      take: 8,
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: true, role: true },
    }),
  ]);

  return NextResponse.json({
    query: q,
    projects,
    storageItems,
    brands,
    people,
  });
}

