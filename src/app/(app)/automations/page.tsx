import { redirect } from "next/navigation";
import { Bell, CalendarClock, Mail, Zap } from "lucide-react";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import {
  ARCHIVE_AFTER_DAYS, BRAND_NUDGE_DAYS, DEADLINE_ALERT_DAYS, ESCALATE_AFTER, REVISION_ALERT_ROUND, STALE_DAYS,
} from "@/lib/constants";
import { fmtDateTime } from "@/lib/utils";
import RunNowButton, { TestEmailButton } from "./run-now";

// Everything the old Apps Script did, in one place: what fires on an edit,
// what runs every morning, who gets what, and a log of daily runs.

const INSTANT = [
  { when: "Someone is assigned a task", what: "Email + notification to that person with the brief, brand, priority and their deadline", who: "Assignee" },
  { when: "Edit status → First Cut Sent", what: "\"Your first cut is ready\" email to the brand; notification to the brand's TBM POC", who: "Brand client logins · POC" },
  { when: "Edit status → External Revision Rn", what: "Revision round set to n automatically", who: "—" },
  { when: `Revision round reaches ${REVISION_ALERT_ROUND}`, what: "Alert that the project is on its 3rd+ revision", who: "Admins (email + notification)" },
  { when: "Edit status → Final Approved", what: "Final approval set to Approved; \"ready to deliver\" notification", who: "Admins" },
  { when: "Delivery → Project Closed", what: "Closed notification; archive clock starts", who: "Admins · assignee" },
  { when: "Team or client deadline changed", what: "Deadline-pushed counter goes up (shown on the task)", who: "—" },
  { when: "Person added on Team page", what: "Welcome email with a link to their tasks", who: "New person" },
  { when: "Client login created", what: "\"Your tracker is live\" email", who: "Brand client" },
  { when: "Person set to Inactive", what: "Locked out immediately; their tasks stay as they are", who: "—" },
];

const DAILY = [
  { what: "Stale-task reminders", detail: `Tasks with no update for ${STALE_DAYS}+ day. One email per person. Reminder #2 warns admins will be told; from #${ESCALATE_AFTER} admins are CC'd. Stops as soon as they update. Skips tasks waiting on the brand.`, who: "Assignee (admins CC'd)" },
  { what: "Deadline heads-up", detail: `Team deadlines in the next ${DEADLINE_ALERT_DAYS} days.`, who: "Assignee" },
  { what: "Brand feedback nudge", detail: `A cut has been with the brand for ${BRAND_NUDGE_DAYS}+ days; repeats every ${BRAND_NUDGE_DAYS} days.`, who: "Brand client logins" },
  { what: "Move to Completed", detail: `Projects closed ${ARCHIVE_AFTER_DAYS}+ days ago move to Completed.`, who: "—" },
  { what: "Weekly report (Mondays)", detail: "Active, late, waiting on brand, delivered this week, due this week, top late projects.", who: "Admins" },
];

const LABELS: Record<string, string> = {
  reminders: "reminder emails",
  escalated: "escalated",
  deadlineAlerts: "deadline alerts",
  brandNudges: "brand nudges",
  archived: "moved to Completed",
};

export default async function AutomationsPage() {
  const me = await requireTeamPage();
  if (!isAdmin(me)) redirect("/home");
  const runs = await prisma.automationRun.findMany({ orderBy: { ranAt: "desc" }, take: 15 });
  const smtp = Boolean(process.env.SMTP_HOST);
  const cron = Boolean(process.env.CRON_SECRET);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          These replace the Apps Script triggers. Instant ones fire the moment someone changes a task. Daily ones run every
          morning at 8:00 AM IST once the app is on Vercel; on your computer, use Run now to test them.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
          <span className={smtp ? "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"}>
            <Mail className="mr-1 inline h-3 w-3" />
            {smtp ? `Email sending is on (from ${process.env.SMTP_FROM || process.env.SMTP_USER})` : "Email not set up (SMTP_* in .env): only in-app notifications go out"}
          </span>
          <span className={cron ? "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"}>
            <CalendarClock className="mr-1 inline h-3 w-3" />
            {cron ? "8 AM schedule ready (runs on Vercel)" : "CRON_SECRET missing in .env: the 8 AM schedule can't run"}
          </span>
          {smtp && <TestEmailButton />}
          <span className="rounded-full bg-canvas px-2.5 py-1 text-muted">
            <Bell className="mr-1 inline h-3 w-3" />
            In-app notifications always on (sidebar → Notifications)
          </span>
        </div>

        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Zap className="h-4 w-4 text-accent" /> Instant (when a task changes)</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead className="bg-canvas text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-2 py-2 font-medium">What happens</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                </tr>
              </thead>
              <tbody>
                {INSTANT.map((r) => (
                  <tr key={r.when} className="border-t border-line/70 align-top">
                    <td className="px-4 py-2 font-medium">{r.when}</td>
                    <td className="px-2 py-2 text-muted">{r.what}</td>
                    <td className="px-4 py-2 text-muted">{r.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CalendarClock className="h-4 w-4 text-accent" /> Daily at 8:00 AM IST</h2>
            <RunNowButton />
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead className="bg-canvas text-left text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Automation</th>
                  <th className="px-2 py-2 font-medium">Details</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                </tr>
              </thead>
              <tbody>
                {DAILY.map((r) => (
                  <tr key={r.what} className="border-t border-line/70 align-top">
                    <td className="px-4 py-2 font-medium">{r.what}</td>
                    <td className="px-2 py-2 text-muted">{r.detail}</td>
                    <td className="px-4 py-2 text-muted">{r.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Run now sends the real reminders and emails, and includes the weekly report so you can see it any day. Running it more than once a day sends reminders again.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-semibold">Recent runs</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            {runs.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">No runs yet.</p>}
            {runs.map((r) => {
              let res: Record<string, unknown> = {};
              try { res = JSON.parse(r.result); } catch {}
              const parts = Object.entries(LABELS).map(([k, l]) => `${Number(res[k] ?? 0)} ${l}`);
              if (res.weekly) parts.push("weekly report sent");
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/70 px-4 py-2 text-[13px] first:border-0">
                  <span className="w-36 shrink-0 text-muted">{fmtDateTime(r.ranAt)}</span>
                  <span className="w-48 shrink-0">{r.source}</span>
                  <span className="text-muted">{parts.join(" · ")}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
