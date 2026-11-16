import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";

function ensureProductionOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  // If running on Vercel/live production but NEXTAUTH_URL was accidentally left as localhost
  if (host && !host.includes("localhost") && (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost"))) {
    process.env.NEXTAUTH_URL = `${proto}://${host}`;
  }
}

export async function GET(req: NextRequest, ctx: any) {
  ensureProductionOrigin(req);
  return (NextAuth as any)(authOptions)(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
  ensureProductionOrigin(req);
  return (NextAuth as any)(authOptions)(req, ctx);
}
