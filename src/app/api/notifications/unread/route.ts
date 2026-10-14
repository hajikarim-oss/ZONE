import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Unread notification count for the sidebar badge (polled every 30s).
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await currentUser();
  if (!s || s.role === "CLIENT") return NextResponse.json({ count: 0 });
  const count = await prisma.notification.count({ where: { userId: s.id, read: false } });
  return NextResponse.json({ count });
}
