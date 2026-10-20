import { requireTeamPage } from "@/lib/auth";
import { canSeeAll, isAdmin } from "@/lib/rbac";
import {
  ARCHIVE_AFTER_DAYS, BRAND_NUDGE_DAYS, DEADLINE_ALERT_DAYS, ESCALATE_AFTER, REVISION_ALERT_ROUND, STALE_DAYS,
} from "@/lib/constants";
import { STAGE_GROUPS } from "@/lib/status";
import TourButton from "./tour-button";

// Written guide to the panel: how the work flows, what each status means,
// who is notified about what, and the admin side. Shown per role.

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-7">
      <h2 className="mb-3 text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[600px] text-[13px]">
        <thead className="bg-canvas text-left text-[12px] text-muted">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/70 align-top">
              {r.map((c, j) => <td key={j} className={j === 0 ? "px-3 py-2 font-medium" : "px-3 py-2 text-ink/80"}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function GuidePage() {
  const me = await requireTeamPage();
  const seeAll = canSeeAll(me);
  const admin = isAdmin(me);

  const toc: [string, string][] = [
    ["start", "Getting started"],
    ["roles", "Who sees what"],
    ["day", "Your daily routine"],
    ["flow", "The workflow & statuses"],
    ["stages", "Stages, late tags & deadlines"],
    ["updates", "Comments, collaborators & history"],
    ["notifications", "Notifications & emails"],
    ...(seeAll ? ([["managing", "Managing projects"]] as [string, string][]) : []),
    ...(admin ? ([["admin", "Admin: team, brands & automations"]] as [string, string][]) : []),
    ["clients", "What brands see"],
    ["faq", "FAQ"],
  ];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">Help &amp; guide</h1>
            <p className="mt-1 text-[13px] text-muted">How the Post Prod Panel works, from first task to final delivery.</p>
          </div>
          <TourButton />
        </div>

        <nav className="mt-6 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-canvas p-4 text-[13px] sm:grid-cols-2">
          {toc.map(([id, label], k) => (
            <a key={id} href={`#${id}`} className="text-ink/80 hover:text-accent hover:underline">
              {k + 1}. {label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-10 pb-16">
          <Section id="start" title="1. Getting started">
            <p>
              The panel replaces the Master control sheet, the Team sheet (one tab per person) and the per-brand sheets. Everyone
              works on the same task records, so a change made by anyone shows up for everyone straight away. There is no Save
              button and nothing to sync.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Sign in</b> with your TBM Google account (freelancers: the Gmail your lead added). An admin has to add you on the Team page first.</li>
              <li>The <b>sidebar</b> has Home, My tasks, Notifications{seeAll ? ", All projects" : ""}, your brands{seeAll ? ", the Manage section" : ""} and this guide.</li>
              <li>Switch <b>light / dark mode</b> with the moon / sun button at the bottom of the sidebar.</li>
            </ul>
          </Section>

          <Section id="roles" title="2. Who sees what">
            <Table
              head={["Role", "Sees", "Can change"]}
              rows={[
                ["Team member", "Tasks assigned to them, tasks they added, and tasks they collaborate on; the due date, context from their lead, comments and history.", "Add their own tasks; status, revision round, shoot status and On hold on tasks assigned to them; name, brand, deadline and priority on tasks they added; collaborators; comments."],
                ["Manager", "Every project and brand, both deadlines, internal notes, team status and delay tracker, Completed.", "Everything on every task; add tasks; move tasks to Completed."],
                ["Admin", "Everything managers see, plus Team, Brands & clients and Automations.", "Everything, plus people, roles, Active/Inactive, brands, client logins and deleting tasks."],
                ["Brand client", "Only their brand's content, in friendly wording, with the revision round and delivery date.", "Nothing; view only."],
              ]}
            />
            <p className="text-muted">Team members never see the client deadline or internal notes; they aren't even sent to their browser.</p>
          </Section>

          <Section id="day" title="3. Your daily routine">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Open <b>Home</b>: check what's due in the next 7 days and anything tagged late.</li>
              <li>Check <b>Notifications</b> (the purple number in the sidebar) for new assignments.</li>
              <li>Open <b>My tasks</b>. For every task you touched today, move the <b>Edit status</b> forward (right in the row, or in the task panel).</li>
              <li>Post a short <b>comment</b> or Drive link in the task panel when you share a cut, render, or hit a blocker. @mention whoever needs to know.</li>
              <li>Doing something that isn't on the panel yet? <b>Add task</b> in My tasks so it's tracked.</li>
              {seeAll && <li>Managers: scan <b>All projects</b> grouped by brand, and the <b>Delay tracker</b> on Home, every morning.</li>}
            </ol>
            <p>
              If a task hasn't been updated for {STALE_DAYS} day, you'll get a reminder at 8:00 AM. Keeping statuses current is
              what keeps reminders away.
            </p>
          </Section>

          <Section id="flow" title="4. The workflow & statuses">
            <p>Each task has a pipeline. These are the dropdowns in the task panel, in order:</p>
            <Table
              head={["Step", "Options", "Notes"]}
              rows={[
                ["Brief", "Not Started → Brief Received → Brief Call Done", ""],
                ["Concept / script", "Not Started → In Progress → Sent to Client → Approved", "Creative team members update this one; it's the status column in their list."],
                ["Pre-pro", "Not Started → In Progress → Complete", ""],
                ["Shoot", "Not Started → Scheduled → Done → Footage Received", "Footage Received means editing can start."],
                ["Edit status", "Not Started → In Progress → First Cut Ready → First Cut Sent → In Review → Internal Revision R1–R4 / External Revision R1–R4 → Final Approved", "The main status editors update."],
                ["Revision round", "0–4", "Set automatically by External Revision Rn; can also be set by hand."],
                ["Client review", "Pending / Received / NA", ""],
                ["Final approval", "Pending / Approved / NA", "Set to Approved automatically when Edit status becomes Final Approved."],
                ["Delivery", "Not Started → Files Sent → Invoice Raised → Project Closed", "Files Sent = delivered. Project Closed = done; it moves to Completed after 30 days."],
              ]}
            />
            <p><b>Internal revision</b> = changes asked for by TBM before the brand sees it. <b>External revision</b> = changes asked for by the brand.</p>
          </Section>

          <Section id="stages" title="5. Stages, late tags & deadlines">
            <p>The coloured <b>Stage</b> on every task is worked out from the statuses above, so you never set it by hand:</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_GROUPS.map((g) => (
                <span key={g.key} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px]" style={{ background: g.dot + "2b" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.dot }} />
                  {g.label}
                </span>
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li><span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">Team late · Nd</span> past the {seeAll ? "team" : ""} deadline while the work is with us.</li>
              <li><span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Waiting on brand · Nd</span> the cut has been sent / is in review and the brand hasn't come back.</li>
            </ul>
            <p>
              <b>Start</b> and <b>End</b> (date + time) are when the work starts and is planned to end; they can be the same day at
              different times. <b>Due date</b> is when the task should be complete (late tags are worked out from it).
            </p>
            {seeAll ? (
              <p>
                <b>Due date</b> is the internal due date (what the team sees). <b>Client deadline</b> is what was promised to
                the brand (what the brand sees as "Delivery date"). Every time either is pushed, the task counts it.
              </p>
            ) : (
              <p>Your <b>deadline</b> is the date your lead needs the work by. If it changes, the task shows how many times it was pushed.</p>
            )}
          </Section>

          <Section id="updates" title="6. Comments, collaborators & history">
            <ul className="list-disc space-y-1 pl-5">
              <li>Every task panel has <b>Comments</b> at the bottom. Write a note or paste a Drive link and press <b>Ctrl + Enter</b>. Links become clickable. You can delete your own comments.</li>
              <li>Type <b>@</b> and start a name to <b>mention</b> someone. They get a notification and an email, and are added as a collaborator.</li>
              <li><b>Collaborators</b> can see the task and are notified when someone comments. The assignee, whoever added the task, and admins / managers can add or remove them from the task panel.</li>
              <li>A comment from the assignee counts as updating the task (it resets their reminders).</li>
              <li><b>On hold</b> (toggle in the task panel, or drag to the On hold column) pauses a task: no late tags and no reminders until it's taken off hold.</li>
              <li><b>Activity</b> shows every change: who changed which field, from what, to what, and when.</li>
              <li><b>Description</b> is the brief. Admins / managers and whoever added the task can edit it.</li>
              <li><b>Subtasks</b>: break a task into small steps, each with its own assignee and due date. Tick them off as you go. A subtask assigned to you makes the task show in your My tasks.</li>
              <li><b>Attachments</b>: click <b>Google Drive</b> to attach files or folders straight from Drive, or <b>Paste a link</b> (Drive, WeTransfer, Frame.io…). Big footage stays in Drive.</li>
              <li><b>Storage</b>: pick which hard drive / folder the project files are on. Choose <b>+ Add new storage…</b> to add a new drive.</li>
              {seeAll && <li><b>Internal notes</b> are for admins and managers only.</li>}
            </ul>
          </Section>

          <Section id="notifications" title="7. Notifications & emails">
            <p>
              <b>In-app:</b> the purple number next to <b>Notifications</b> is your unread count. It updates by itself every 30 seconds.
              Click a notification to open the task (it's then marked read), or use <b>Mark all as read</b>.
            </p>
            <p className="font-medium">Instant (the moment something changes):</p>
            <Table
              head={["When", "Who's told", "How"]}
              rows={[
                ["A task is assigned to someone", "The assignee", "Notification + email with brief, brand, priority and deadline"],
                ["Edit status → First Cut Sent", "Brand client logins; the brand's TBM POC", "Email to the brand; notification to the POC"],
                [`Revision round reaches ${REVISION_ALERT_ROUND}`, "Admins", "Notification + email"],
                ["Final approval → Approved", "Admins", "Notification (ready to deliver)"],
                ["Delivery → Project Closed", "Admins + assignee", "Notification 🎉"],
                ["Person added on the Team page", "That person", "Welcome email"],
                ["Client login created", "That client", "\"Your tracker is live\" email"],
              ]}
            />
            <p className="font-medium">Every morning at 8:00 AM:</p>
            <Table
              head={["Check", "Who's told", "Details"]}
              rows={[
                ["Stale tasks", "Assignee", `One email listing tasks with no update for ${STALE_DAYS}+ day. Reminder #2 warns that admins will be told; from #${ESCALATE_AFTER} admins are copied in. Stops as soon as you update. Tasks waiting on the brand are skipped.`],
                ["Deadlines coming up", "Assignee", `Due dates in the next ${DEADLINE_ALERT_DAYS} days.`],
                ["Brand feedback nudge", "Brand client logins", `A cut has been with the brand ${BRAND_NUDGE_DAYS}+ days; repeats every ${BRAND_NUDGE_DAYS} days.`],
                ["Move to Completed", "—", `Projects closed ${ARCHIVE_AFTER_DAYS}+ days ago move to Completed.`],
                ["Weekly report (Mondays)", "Admins", "Active, late, waiting on brand, delivered this week, due this week, top late projects."],
              ]}
            />
          </Section>

          {seeAll && (
            <Section id="managing" title="8. Managing projects">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Add task</b> (All projects or a brand page): name, brand, assignee, priority, start / end, due date, client deadline. The code (TBM-…) is assigned automatically and the assignee is notified.</li>
                <li>Change assignee, brand, priority or status <b>right in the list row</b>; open the task panel for everything else.</li>
                <li>Use <b>Group</b> (stage / brand / assignee / priority), <b>filters</b> and <b>Search</b> to slice the list. Tick <b>Show delivered &amp; closed</b> to include finished work.</li>
                <li><b>Board</b> has five columns (Upcoming, Ongoing, Revision, On hold, Completed); drag cards between them. <b>Calendar</b> shows team or client deadlines by date.</li>
                <li>Team members can add their own tasks too; they're assigned to the person who added them and show up in All projects, marked with who added them.</li>
                <li><b>Home → Team status</b> shows who's Available (0 open tasks), Busy (1–4) or Overloaded (5+), and when they're free.</li>
                <li><b>Move to Completed</b> from the task panel (box icon) to hide a task from active lists; open it from Completed to move it back.</li>
                {admin && <li>Admins can <b>delete</b> a task (bin icon). Prefer Completed; deleting removes its history too.</li>}
              </ul>
            </Section>
          )}

          {admin && (
            <Section id="admin" title="9. Admin: team, brands & automations">
              <p className="font-medium">Team</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Add person</b>: name, email, department, role. They get a welcome email and can sign in with that Google account at once.</li>
                <li>Click <b>Active / Inactive</b> to lock or unlock someone instantly. Their tasks are kept.</li>
                <li><b>Password</b> gives someone an email + password login as well (for people who can't use Google sign-in).</li>
                <li>Removing someone unassigns their tasks; set them Inactive instead to keep the assignment.</li>
              </ul>
              <p className="font-medium">Brands &amp; clients</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Add a brand (name, POC, colour) and it appears in every Brand dropdown.</li>
                <li><b>Add client login</b> gives the brand's contact their own tracker. Share the password with them yourself.</li>
                <li>A brand with tasks can't be deleted; move or delete its tasks first.</li>
              </ul>
              <p className="font-medium">Automations</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Lists every automatic action. The daily checks run at 8:00 AM once the panel is live online.</li>
                <li><b>Send test email</b> checks email is working. <b>Run now</b> runs the morning checks immediately (it sends real reminders, so don't run it twice a day).</li>
                <li><b>Recent runs</b> shows what each run did.</li>
              </ul>
            </Section>
          )}

          <Section id="clients" title={`${admin ? 10 : seeAll ? 9 : 8}. What brands see`}>
            <p>Brand contacts sign in as <b>Brand / client</b> and see only their brand's content, grouped as:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Ready for your review</b>: First Cut Sent or In Review</li>
              <li><b>In progress</b>: shown as Brief in progress, Pre-production, Shoot scheduled, Being edited, Being refined or Working on your feedback</li>
              <li><b>Delivered</b>: Delivered / Completed</li>
            </ul>
            <p>They see the revision round and delivery date (the client deadline). They never see team names, due dates, internal notes or updates.</p>
          </Section>

          <Section id="faq" title={`${admin ? 11 : seeAll ? 10 : 9}. FAQ`}>
            <div className="space-y-3">
              <p><b>I can't change a field.</b> On tasks assigned to you, you can change status, revision round, shoot status and On hold. On tasks you added you can also change the name, brand, deadline and priority. Ask your lead for anything else.</p>
              <p><b>A task is missing from My tasks.</b> It may not be assigned to you yet, or it's delivered / closed; tick "Show delivered &amp; closed" (on the Board, it's in the Completed column).</p>
              <p><b>What is a brand workspace?</b> Each brand page (e.g. Unseen Man) is a workspace with its own board. Members (the people shown at the top right) see every task in it, can add tasks for anyone, and can add teammates. Tasks assigned to you there also show in your My tasks.</p>
              <p><b>How do I join a workspace?</b> Ask an admin or any member to add you from the members button at the top right of the brand page.</p>
              {admin && <p><b>Setting up the Google Drive button (admin, once):</b> in Google Cloud (same project as the Google sign-in) enable the <b>Google Picker API</b> and <b>Google Drive API</b>, create an <b>API key</b>, add your panel addresses under the OAuth client's "Authorised JavaScript origins", then add <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> and <code>NEXT_PUBLIC_GOOGLE_API_KEY</code> in Vercel and .env. Until then, people can paste links.</p>}
              <p><b>Can I add my own task?</b> Yes. Use <b>Add task</b> in My tasks. It's assigned to you, and admins and managers can see it.</p>
              <p><b>Who can see a task I added?</b> You, any collaborators you add, and admins / managers. Other team members can't.</p>
              <p><b>How do I share a task with a teammate?</b> Add them under <b>Collaborators</b> in the task panel, or @mention them in a comment.</p>
              <p><b>What do the Board columns mean?</b> Upcoming = brief, script, pre-pro or shoot; Ongoing = editing, with the brand for review, or approved; Revision = internal or external revisions; On hold = paused; Completed = delivered or closed.</p>
              <p><b>What happens when I drag a card?</b> The status changes to match the column: Ongoing sets Edit status to In Progress, Revision starts the next revision round, Completed marks it Final Approved and Files Sent. You can fine-tune it in the task panel.</p>
              <p><b>Does On hold stop reminders?</b> Yes. On-hold tasks get no late tags, no stale reminders and no deadline alerts.</p>
              <p><b>Who sees my comments?</b> Everyone on the team who can see the task. Brand clients never see comments.</p>
              <p><b>I mentioned someone but they didn't get it.</b> Pick their name from the list that appears after typing @ so the full name is used.</p>
              <p><b>Can I use this on my phone?</b> Yes. Open the panel link in your phone browser and use "Add to Home Screen" to install it like an app.</p>
              <p><b>Can I see the client deadline?</b> Team members see only the due date; the client deadline is for admins and managers.</p>
              <p><b>How do I stop reminder emails?</b> Update the task's status or post an update. Reminders only go out for tasks with no update for {STALE_DAYS}+ day.</p>
              <p><b>I can't sign in.</b> You must be added on the Team page first and be Active. Use the exact Google account your lead added.</p>
              <p><b>Do we still use the Google Sheets?</b> No. The panel is the only source of truth now; changes in the sheets don't show here.</p>
              <p><b>Where do files go?</b> Keep them in Google Drive and paste the link as an update on the task.</p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
