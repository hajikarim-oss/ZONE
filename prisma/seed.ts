// Makes sure the first admin(s) exist so someone can sign in and set things
// up, even before (or without) running the sheet import.
//   ADMIN_EMAILS="sachin@theboredmonkey.com,someone@theboredmonkey.com" npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const emails = (process.env.ADMIN_EMAILS || "sachin@theboredmonkey.com,jiya.bhagat@theboredmonkey.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    const KNOWN: Record<string, string> = { "jiya.bhagat@theboredmonkey.com": "Jiya Bhagat", "sachin@theboredmonkey.com": "Sachin" };
    const name = KNOWN[email] ?? email.split("@")[0].split(/[._]/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN", active: true },
      create: {
        email,
        name,
        role: "ADMIN",
        department: "Editor",
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
      },
    });
    console.log(`Admin ready: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
