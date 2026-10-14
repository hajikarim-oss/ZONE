/**
 * Clears data from the Post Prod Panel database (this app only — the
 * Campaign Panel and the Google Sheets are not touched).
 *
 *   npm run reset:data
 *     Deletes all tasks/projects, their updates and change history,
 *     notifications, automation run logs, brands and client logins.
 *     KEEPS the team (logins), so everyone can still sign in.
 *
 *   npm run reset:data -- --everything
 *     Also deletes every team member except the admins in ADMIN_EMAILS.
 *     Use this for a completely blank panel.
 *
 * Asks you to type DELETE before doing anything. This cannot be undone.
 */
import { PrismaClient } from "@prisma/client";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();
const everything = process.argv.includes("--everything");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "sachin@theboredmonkey.com,jiya.bhagat@theboredmonkey.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  const [projects, updates, activity, notifications, runs, brands, clients, users] = await Promise.all([
    prisma.project.count(),
    prisma.update.count(),
    prisma.activity.count(),
    prisma.notification.count(),
    prisma.automationRun.count(),
    prisma.brand.count(),
    prisma.client.count(),
    prisma.user.count({ where: { email: { notIn: ADMIN_EMAILS } } }),
  ]);

  console.log("\nThis will permanently delete from the Post Prod Panel database:");
  console.log(`  • ${projects} tasks / projects`);
  console.log(`  • ${updates} updates & links, ${activity} history entries`);
  console.log(`  • ${notifications} notifications, ${runs} automation run logs`);
  console.log(`  • ${brands} brands and ${clients} client logins`);
  if (everything) {
    console.log(`  • ${users} team members (admins kept: ${ADMIN_EMAILS.join(", ")})`);
  } else {
    console.log(`\nKept: the team (${users} members + admins), so everyone can still sign in.`);
    console.log("Add --everything to also remove the team.");
  }
  console.log("\nThe Google Sheets and the Campaign Panel are NOT touched.\n");

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question('Type DELETE to continue (anything else cancels): ');
  rl.close();
  if (answer.trim() !== "DELETE") {
    console.log("Cancelled. Nothing was deleted.");
    return;
  }

  // Order matters only for clarity; updates/activity also cascade from projects.
  await prisma.$transaction([
    prisma.update.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.project.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.automationRun.deleteMany(),
    prisma.client.deleteMany(),
    prisma.brand.deleteMany(),
    ...(everything ? [prisma.user.deleteMany({ where: { email: { notIn: ADMIN_EMAILS } } })] : []),
  ]);

  console.log("\nDone. The panel is clear.");
  if (everything) console.log("Run `npm run db:seed` if you want to be sure the admins are set up.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
