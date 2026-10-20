import crypto from "crypto";
import { APP_URL } from "@/lib/mailer";

// Personal calendar-feed links. The key is signed with NEXTAUTH_SECRET, so a
// feed can't be opened by guessing someone's id or email.
function secret() {
  return process.env.CALENDAR_FEED_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function feedKey(userId: string) {
  return crypto.createHmac("sha256", secret()).update(`calendar:${userId}`).digest("hex").slice(0, 32);
}

export function verifyFeedKey(userId: string, key: string) {
  const a = Buffer.from(feedKey(userId));
  const b = Buffer.from(key || "");
  return !!secret() && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function calendarFeedUrl(userId: string) {
  return `${APP_URL}/api/calendar?u=${encodeURIComponent(userId)}&k=${feedKey(userId)}`;
}

// Constant-time check for the integrations API key.
export function sameKey(given: string | null | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
