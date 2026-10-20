"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Guided tour of the panel. Starts automatically the first time someone signs
// in (remembered per person in this browser), and can be replayed any time
// from "Help & tour" in the sidebar. Steps differ for team members, managers
// and admins. Each step can move to a page and spotlight an element marked
// with data-tour="…".

type Step = {
  title: string;
  body: React.ReactNode;
  target?: string; // data-tour value to spotlight
  route?: string; // page to open first
};

type Props = { userId: string; name: string; role: string };

const START_EVENT = "tbm:start-tour";
export function startTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink">
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

function Flow({ items }: { items: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {items.map((x, i) => (
        <span key={x} className="flex items-center gap-1">
          <Chip>{x}</Chip>
          {i < items.length - 1 && <span className="text-muted">→</span>}
        </span>
      ))}
    </div>
  );
}

function buildSteps(role: string, first: string): Step[] {
  const seeAll = role === "ADMIN" || role === "MANAGER";
  const admin = role === "ADMIN";
  const s: Step[] = [];

  s.push({
    title: `Welcome to the Post Prod Panel, ${first} 👋`,
    body: (
      <>
        <p>This replaces the Master, Team and Brand Google Sheets. Every task, status, note and deadline now lives here, in one place.</p>
        <p className="mt-2">Changes save the moment you make them; there's no Save button and nothing to sync. This tour takes about 2 minutes.</p>
      </>
    ),
  });

  s.push({
    title: "Home: your day at a glance",
    target: "nav-home",
    route: "/home",
    body: seeAll ? (
      <>
        <p>The top row counts active work, what's on track, team delays, what's waiting on the brand and what's past the client deadline.</p>
        <p className="mt-2">Below that: what's due in the next 7 days, <b>Team status</b> (who's Available / Busy / Overloaded and when they're free) and the <b>Delay tracker</b> showing whether the team or the brand is holding things up.</p>
      </>
    ) : (
      <p>Your numbers: active tasks, what's on track, anything late, what's waiting on the brand, and what's due in the next 7 days.</p>
    ),
  });

  s.push({
    title: "My tasks",
    target: "nav-mytasks",
    route: "/my-tasks",
    body: (
      <>
        <p>Tasks assigned to you, tasks you added, and tasks you've been added to as a <b>collaborator</b>. The number next to it is how many are still open.</p>
        {!seeAll && <p className="mt-2">This replaces your personal tab in the old Team sheet.</p>}
      </>
    ),
  });

  s.push({
    title: "List, Board and Calendar",
    target: "view-tabs",
    route: "/my-tasks",
    body: (
      <>
        <p><b>List</b> is the main view: one row per task, with dropdowns you can change right in the row.</p>
        <p className="mt-2"><b>Board</b> has five columns: <b>Upcoming</b>, <b>Ongoing</b>, <b>Revision</b>, <b>On hold</b> and <b>Completed</b>. Drag a card to another column to move it; the status updates for you.</p>
        <p className="mt-2"><b>Calendar</b> puts tasks on their deadline date.</p>
      </>
    ),
  });

  s.push({
    title: "Find things fast",
    target: "toolbar",
    route: "/my-tasks",
    body: (
      <p>
        Search, filter by brand{seeAll ? ", person" : ""} or priority, and group the list by stage, brand{seeAll ? ", assignee" : ""} or priority. Delivered and closed work is hidden; tick <b>Show delivered &amp; closed</b> to see it.
      </p>
    ),
  });

  s.push({
    title: "Updating a task",
    body: (
      <>
        <p>Click any task to open its panel on the right. There you'll see the brief / context, deadline, the full pipeline and every update.</p>
        <p className="mt-2">
          {seeAll
            ? "You can change every field: assignee, brand, deadlines, priority, type and each pipeline stage."
            : "On tasks assigned to you, you can change the status, revision round, shoot status and On hold. On tasks you added yourself you can also change the name, brand, deadline and priority."}
        </p>
      </>
    ),
  });

  s.push({
    title: "Status",
    body: (
      <>
        <p>Every task has one <b>Status</b>, the same as the board columns:</p>
        <Flow items={["Upcoming", "Ongoing", "Revision", "On hold", "Completed"]} />
        <ul className="mt-3 list-disc space-y-1 pl-4">
          <li>Change it from the Status dropdown, by dragging on the Board, or tick the circle / <b>Mark complete</b>.</li>
          <li>Each move into <b>Revision</b> starts the next round; admins are told at round 3.</li>
          <li><b>On hold</b> pauses reminders.</li>
        </ul>
      </>
    ),
  });

  s.push({
    title: "Comments & collaborators",
    body: (
      <>
        <p>At the bottom of every task panel is <b>Comments</b>. Post progress notes, feedback or Drive links (Ctrl + Enter to send). Type <b>@</b> and a name to mention someone: they're notified and added as a collaborator.</p>
        <p className="mt-2"><b>Collaborators</b> (in the task panel) can see the task and its comments, and get notified of new comments. The assignee or whoever added the task can add or remove them.</p>
        <p className="mt-2">The <b>Activity</b> tab shows every change: who changed what, and when.</p>
      </>
    ),
  });

  if (!seeAll) {
    s.push({
      title: "Adding your own task",
      target: "add-task",
      route: "/my-tasks",
      body: (
        <>
          <p>Use <b>Add task</b> to log your own work: name, brand, priority and your deadline. It's assigned to you automatically and the admins can see it.</p>
          <p className="mt-2">Pick <b>+ Collaborator</b> to share it with teammates; only you, your collaborators and the admins / managers can see it.</p>
        </>
      ),
    });
  }

  if (seeAll) {
    s.push({
      title: "All projects",
      target: "nav-projects",
      route: "/projects",
      body: <p>Every brand and every deliverable, grouped by brand. This replaces the Master sheet's PROJECTS tab. Change the assignee, brand, priority or status right in the row.</p>,
    });
    s.push({
      title: "Adding a task",
      target: "add-task",
      route: "/projects",
      body: (
        <>
          <p>Give it a name, then choose the brand, assignee, priority, <b>due date</b> and <b>client deadline</b>. It gets the next code (TBM-…) automatically.</p>
          <p className="mt-2">The assignee gets a notification and an email straight away; collaborators you add are notified too. Add brief notes in <b>Context for the team</b> inside the task.</p>
        </>
      ),
    });
    s.push({
      title: "Two deadlines",
      body: (
        <>
          <p><b>Due date</b>: when the work should be complete. Team members only ever see this one.</p>
          <p className="mt-2"><b>Client deadline</b>: the delivery date promised to the brand. Only admins, managers and the brand see it.</p>
          <p className="mt-2">Every time a deadline is pushed, the task counts it ("Deadline pushed ×2"). <b>Internal notes</b> in the task panel are also hidden from team members.</p>
        </>
      ),
    });
  }

  s.push({
    title: "Brands",
    target: "nav-brands",
    body: <p>Each brand has its own page with just its tasks. {seeAll ? "Brand colours make them easy to spot in lists." : "You'll only see brands you have tasks for, and only your own tasks inside them."}</p>,
  });

  s.push({
    title: "Inbox",
    target: "nav-notifications",
    route: "/inbox",
    body: (
      <>
        <p>The purple number is how many unread notifications you have. It updates on its own every 30 seconds. Click one to open the task; it's then marked as read.</p>
        <p className="mt-2 font-medium">You'll be notified when:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>a task is assigned to you (also by email)</li>
          <li>you have tasks with no update for a day (daily reminder)</li>
          {seeAll && <li>a first cut is sent for a brand you look after</li>}
          {admin && <li>a project hits revision round 3, is approved, or closes</li>}
          {!admin && <li>a task of yours is closed 🎉</li>}
        </ul>
      </>
    ),
  });

  s.push({
    title: "Emails & daily reminders",
    body: (
      <>
        <p>Every morning at 8:00 AM the panel checks everyone's tasks:</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li><b>No update for a day</b>: one email listing those tasks. Day 2 is a stronger reminder; from day 3 the admins are copied in.</li>
          <li><b>Deadline in the next 3 days</b>: a heads-up email.</li>
          <li>Tasks waiting on the brand don't count against you.</li>
        </ul>
        <p className="mt-2"><b>To stop reminders:</b> change the task's status or post an update.</p>
      </>
    ),
  });

  if (seeAll) {
    s.push({
      title: "Completed",
      target: "nav-completed",
      route: "/archive",
      body: <p>Projects move here automatically 30 days after they're closed, keeping the lists clean. Open any of them to see their full history, or move one back to active.</p>,
    });
  }

  if (admin) {
    s.push({
      title: "Team",
      target: "nav-team",
      route: "/team",
      body: (
        <>
          <p><b>Add person</b> → they get a welcome email and can sign in with that Google account straight away (company or Gmail).</p>
          <p className="mt-2">Set their <b>department</b> and <b>role</b> (Team member / Manager / Admin). Click <b>Active</b> to make someone Inactive: they're locked out at once, and their tasks stay as they are.</p>
        </>
      ),
    });
    s.push({
      title: "Brands & clients",
      target: "nav-brandsadmin",
      route: "/brands",
      body: (
        <>
          <p>Add a brand and it appears in every Brand dropdown straight away.</p>
          <p className="mt-2"><b>Add client login</b> gives the brand's POC their own tracker: only their brand, in friendly wording ("Being edited", "Ready for your review"), with the revision round and delivery date. No team names, due dates or notes.</p>
        </>
      ),
    });
    s.push({
      title: "Automations",
      target: "nav-automations",
      route: "/automations",
      body: (
        <>
          <p>Everything the old Apps Script did, listed in one place: what fires instantly when a task changes, and what runs every morning.</p>
          <p className="mt-2">Use <b>Send test email</b> to check email, and <b>Run now</b> to run the morning checks immediately (it sends real reminders). Recent runs are logged at the bottom.</p>
        </>
      ),
    });
  }

  s.push({
    title: "Light or dark",
    target: "theme",
    body: <p>Switch between light and dark mode here. Your choice is remembered.</p>,
  });

  s.push({
    title: "That's it! 🎉",
    target: "nav-help",
    body: (
      <>
        <p>Open <b>Help &amp; tour</b> any time for the full guide, or to take this tour again.</p>
        <p className="mt-2">Golden rule: <b>keep your status current and post updates here</b>, not on WhatsApp. Everyone sees the same thing, instantly.</p>
      </>
    ),
  });

  return s;
}

type Rect = { top: number; left: number; width: number; height: number };

export default function Tour({ userId, name, role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => buildSteps(role, name.split(" ")[0] || name), [role, name]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const storeKey = `tbm-tour-done:${userId}`;

  // Auto-start the first time
  useEffect(() => {
    let done = false;
    try {
      done = localStorage.getItem(storeKey) === "1";
    } catch {}
    if (!done) {
      const t = setTimeout(() => {
        setI(0);
        setOpen(true);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [storeKey]);

  // Replay from Help & tour
  useEffect(() => {
    const h = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(START_EVENT, h);
    return () => window.removeEventListener(START_EVENT, h);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    setRect(null);
    try {
      localStorage.setItem(storeKey, "1");
    } catch {}
  }, [storeKey]);

  const step = open ? steps[i] : null;

  // Go to the step's page
  useEffect(() => {
    if (step?.route && pathname !== step.route) router.push(step.route);
  }, [step, pathname, router]);

  // Find and measure the spotlight target (waits for the page to render)
  useLayoutEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    let tries = 0;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      // Phones: the sidebar is tucked away, so show every step as a centred card
      if (window.innerWidth < 768) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      if (tries++ < 30) timer = setTimeout(measure, 100);
      else setRect(null); // not on screen: show the card centred
    };
    raf = requestAnimationFrame(measure);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [step, pathname]);

  // Keyboard: ← → Esc
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((x) => (x < steps.length - 1 ? x + 1 : x));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;

  const pad = 6;
  const W = 360;
  let cardStyle: React.CSSProperties;
  // Pointer arrow from the card to the highlighted item (Asana-style)
  let arrow: { side: "left" | "top" | "bottom"; offset: number } | null = null;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceRight = vw - (rect.left + rect.width);
    const midY = rect.top + rect.height / 2;
    const midX = rect.left + rect.width / 2;
    if (spaceRight > W + 40) {
      const top = Math.min(Math.max(16, midY - 40), vh - 360);
      cardStyle = { left: rect.left + rect.width + 18, top };
      arrow = { side: "left", offset: Math.min(Math.max(16, midY - top), 320) };
    } else if (vh - (rect.top + rect.height) > 300) {
      const left = Math.min(Math.max(16, midX - 40), vw - W - 16);
      cardStyle = { left, top: rect.top + rect.height + 16 };
      arrow = { side: "top", offset: Math.min(Math.max(16, midX - left), W - 24) };
    } else {
      const left = Math.min(Math.max(16, midX - 40), vw - W - 16);
      cardStyle = { left, bottom: vh - rect.top + 16 };
      arrow = { side: "bottom", offset: Math.min(Math.max(16, midX - left), W - 24) };
    }
  } else {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }

  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* dim layer (with a hole when spotlighting) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15,15,20,0.55), 0 0 0 2px #5b3fd1",
          }}
        >
          <span className="absolute -inset-1 animate-ping rounded-lg border-2 border-accent/60" style={{ animationDuration: "1.6s" }} />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,15,20,0.55)]" />
      )}
      {/* click-blocker */}
      <div className="absolute inset-0" />

      <div
        role="dialog"
        aria-label={step.title}
        className="absolute w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-5 text-[13px] leading-relaxed text-ink shadow-pop"
        style={cardStyle}
      >
        {arrow && (
          <span
            className="absolute h-3 w-3 rotate-45 border-line bg-surface"
            style={
              arrow.side === "left"
                ? { left: -7, top: arrow.offset - 6, borderLeftWidth: 1, borderBottomWidth: 1 }
                : arrow.side === "top"
                  ? { top: -7, left: arrow.offset - 6, borderLeftWidth: 1, borderTopWidth: 1 }
                  : { bottom: -7, left: arrow.offset - 6, borderRightWidth: 1, borderBottomWidth: 1 }
            }
          />
        )}
        {i === 0 && (
          <div className="-mx-5 -mt-5 mb-4 flex h-28 items-center justify-center gap-2 rounded-t-xl bg-gradient-to-br from-accent to-[#8d84e8]">
            {["#f06a6a", "#f1bd6c", "#5da283", "#4573d2"].map((c, k) => (
              <span
                key={c}
                className="block h-14 w-10 rounded-md bg-white/90 shadow-lg"
                style={{ transform: `rotate(${(k - 1.5) * 7}deg) translateY(${Math.abs(k - 1.5) * 6}px)`, borderTop: `6px solid ${c}` }}
              />
            ))}
          </div>
        )}
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug">{step.title}</h3>
          <button onClick={finish} className="-mr-1 -mt-1 rounded p-1 text-muted hover:bg-canvas hover:text-ink" title="Close tour (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-ink/85">{step.body}</div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-1">
            {steps.map((_, k) => (
              <span key={k} className={cn("h-1.5 rounded-full transition-all", k === i ? "w-4 bg-accent" : "w-1.5 bg-line")} />
            ))}
          </div>
          {i > 0 && (
            <button className="btn-ghost px-2" onClick={() => setI(i - 1)} title="Back (←)">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button className="btn-primary" onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? "Finish" : i === 0 ? "Start tour" : "Next"} {!last && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>Step {i + 1} of {steps.length}</span>
          {!last && (
            <button onClick={finish} className="hover:text-ink hover:underline">
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
