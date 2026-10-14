import { NextResponse } from "next/server";
import { runDailyAutomations } from "@/lib/automations";

// Vercel Cron hits this daily at 8:00 AM IST (vercel.json) with
// "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDailyAutomations("Scheduled (8:00 AM)");
  return NextResponse.json({ ok: true, ...result });
}
