# TBM Post Production

Replaces the three-sheet setup (Master control sheet, Team sheet with one tab per person, one sheet per brand) with one app. Everyone reads and writes the same project rows. The old sync loop (onEdit/onChange triggers, undo/redo reconciling, brand routing) isn't needed any more.

| Old sheet | In the app |
|---|---|
| Master → PROJECTS | **All projects** (list / board / calendar, inline dropdowns, side panel) |
| Master → TEAM REGISTRY | **Team** (add person → welcome email; Active/Inactive locks login) |
| Master → BRAND REGISTRY | **Brands & clients** (add brand → in every dropdown at once; client logins) |
| Master → 📊 DASHBOARD | **Home** (active / on track / team delays / waiting on brand / overdue, team capacity, delay tracker) |
| Master → ARCHIVE | **Archive** (closed projects auto-archived after 30 days) |
| Team sheet → person tab | **My tasks** (own tasks only; can change status, revision round, post notes/links) |
| Brand sheet | **Client portal** `/portal` (brand POC login, their brand only, friendly status) |
| Apps Script time triggers | `/api/cron/daily` (stale reminders with escalation, deadline alerts, brand nudge, auto-archive, Monday report) |
| Apps Script onEdit automations | Built into `updateTask` (assignment email, first-cut email to brand, R3 alert, approval / closed notifications, auto-fill revision round and final approval, deadline-change counters) |

Login and the Team page are reused from the Campaign Panel: Google sign-in (must be added on the Team page first), optional password for team members, email + password for clients.

Roles: **Admin** (everything, incl. Team and Brands), **Manager** (sees and edits all projects), **Team member** (own tasks only).

## Setup (Windows, in this folder)

1. **Database.** In Supabase (the *jiya tbm* org) create a project, then go to Project Settings → Database → Connection string:
   - `DATABASE_URL`: the **Transaction pooler** string (port 6543), add `?pgbouncer=true` at the end
   - `DIRECT_URL`: the **Session/direct** string (port 5432)
2. Copy `.env.example` to `.env` and fill in the two database URLs. You can copy `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET` and `SMTP_*` from the Campaign Panel's `.env`. Make up a long random `CRON_SECRET`.
3. In Google Cloud Console → the Campaign Panel's OAuth client → add the redirect URI `http://localhost:3000/api/auth/callback/google` (and your Vercel URL + `/api/auth/callback/google` later).
4. Run:
   ```
   npm install
   npm run db:push          # creates the tables in Supabase
   npm run import:sheets    # one-time, READ-ONLY copy of team, brands and projects from the Master sheet
   npm run db:seed          # makes sure ADMIN_EMAILS are admins
   npm run dev
   ```
5. Open http://localhost:3000 and sign in with an admin Google account.

The import only downloads CSV exports of the Master sheet (it must stay "anyone with the link can view"). It never writes to the sheets. Re-running it skips anything that already exists, so app edits are never overwritten.

## Deploy

Push to GitHub, import into Vercel, set the same env vars (with `NEXTAUTH_URL` and `APP_URL` = the Vercel URL). `vercel.json` schedules `/api/cron/daily` at 08:00 IST. Vercel sends `CRON_SECRET` automatically.

## Tunables

`src/lib/constants.ts`: `STALE_DAYS`, `ESCALATE_AFTER`, `DEADLINE_ALERT_DAYS`, `BRAND_NUDGE_DAYS`, `ARCHIVE_AFTER_DAYS`, `REVISION_ALERT_ROUND`, and every dropdown list.
