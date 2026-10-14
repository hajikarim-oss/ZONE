import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Clicking a notification: mark it read, then go to what it points at.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await currentUser();
  const base = new URL(req.url);
  if (!s) return NextResponse.redirect(new URL("/login", base));
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.userId !== s.id) return NextResponse.redirect(new URL("/inbox", base));
  if (!n.read) await prisma.notification.update({ where: { id }, data: { read: true } });
  const target = n.href && n.href.startsWith("/") ? n.href : "/inbox";
  return NextResponse.redirect(new URL(target, base));
}
