/**
 * One-time import from the existing Google Sheets → this app's database.
 *
 * READ-ONLY on the sheets: it only downloads CSV exports of the Master
 * sheet's TEAM REGISTRY, BRAND REGISTRY and PROJECTS tabs (works because the
 * sheet is shared "anyone with the link can view"). Nothing is written back.
 *
 * Safe to re-run: people/brands are matched by email/name, projects by
 * Project ID; anything already in the app is left untouched (so edits made
 * in the app are never overwritten).
 *
 *   npm run import:sheets
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  BRIEF_STAGES, CLIENT_REVIEW, DELIVERY_STATUSES, DEPTS, EDIT_STATUSES, FINAL_APPROVAL, PREPRO_STAGES,
  SCRIPT_STAGES, SHOOT_STATUSES,
} from "../src/lib/constants";

const prisma = new PrismaClient();
const SHEET = process.env.MASTER_SHEET_ID || "1-r9X7E6AIP1wzFKEt_2gM-33FpBUEHoSIPnkOVwa1ws";
const GID = { projects: "781631193", team: "1300133097", brands: "51410008" };
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "sachin@theboredmonkey.com,jiya.bhagat@theboredmonkey.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PALETTE = ["#f06a6a", "#f1bd6c", "#5da283", "#4573d2", "#8d84e8", "#e362e3", "#fd612c", "#4ecbc4", "#aecf55", "#b36bd4"];

async function csv(gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't download tab ${gid} (HTTP ${res.status}). Is the sheet shared as "anyone with the link can view"?`);
  return parseCsv(await res.text());
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "06-May-26" or "03-Jul-26 23:47"
function parseDate(s: string | undefined): Date | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (m[4]) return new Date(Date.UTC(y, mon, Number(m[1]), Number(m[4]) - 5, Number(m[5]) - 30)); // IST → UTC
  return new Date(Date.UTC(y, mon, Number(m[1])));
}

const clean = (s: string | undefined) => (s ?? "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();
const pick = (v: string | undefined, allowed: string[], fallback: string) => {
  const x = clean(v);
  return allowed.includes(x) ? x : fallback;
};
const randomHash = () => bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);

async function importTeam() {
  const rows = await csv(GID.team);
  let added = 0;
  const skipped: string[] = [];
  for (const r of rows.slice(3)) {
    const name = clean(r[0]);
    const email = (r[1] ?? "").trim().toLowerCase();
    if (!name) continue;
    if (!email.includes("@")) { skipped.push(name); continue; }
    if (await prisma.user.findUnique({ where: { email } })) continue;
    const dept = clean(r[2]);
    await prisma.user.create({
      data: {
        name,
        email,
        department: ["Founder", "Creative", "Editor", "Production", "Design Lead"].includes(dept) ? dept : "Editor",
        role: ADMIN_EMAILS.includes(email) ? "ADMIN" : "MEMBER",
        active: clean(r[5]).toLowerCase() !== "inactive",
        passwordHash: await randomHash(),
        createdAt: parseDate(r[4]) ?? undefined,
      },
    });
    added++;
  }
  // Make sure every ADMIN_EMAILS person is admin even if they already existed
  await prisma.user.updateMany({ where: { email: { in: ADMIN_EMAILS } }, data: { role: "ADMIN" } });
  console.log(`Team: ${added} added${skipped.length ? `, skipped (no email): ${skipped.join(", ")}` : ""}`);
}

async function importBrands() {
  const rows = await csv(GID.brands);
  let added = 0;
  let i = await prisma.brand.count();
  for (const r of rows.slice(3)) {
    const name = clean(r[0]);
    if (!name) continue;
    if (await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) continue;
    const raw = (r[3] ?? "").trim();
    // The sheet used the same purple for every brand; give each a distinct colour instead.
    const color = /^#[0-9a-f]{6}$/i.test(raw) && !/^#4C1D/i.test(raw) ? raw : PALETTE[i % PALETTE.length];
    await prisma.brand.create({
      data: {
        name,
        pocName: clean(r[1]) || null,
        pocEmail: (r[2] ?? "").trim().toLowerCase() || null,
        color,
        createdAt: parseDate(r[5]) ?? undefined,
      },
    });
    i++;
    added++;
  }
  console.log(`Brands: ${added} added`);
}

async function importProjects() {
  const rows = await csv(GID.projects);
  const users = await prisma.user.findMany();
  const brands = await prisma.brand.findMany();
  const userBy = (n: string) => users.find((u) => u.name.toLowerCase() === n.trim().toLowerCase());
  const brandBy = (n: string) => brands.find((b) => b.name.toLowerCase() === n.trim().toLowerCase());
  const seen = new Set<string>();
  let added = 0;
  let existing = 0;
  const warnings: string[] = [];

  for (const r of rows.slice(2)) {
    let code = clean(r[0]);
    const title = (r[3] ?? "").trim();
    if (!code || !title) continue;
    // The sheet has a few duplicate IDs (e.g. TBM-009 twice) — keep both rows.
    let n = 2;
    const base = code;
    while (seen.has(code)) code = `${base}-${n++}`;
    seen.add(code);
    if (await prisma.project.findUnique({ where: { code } })) { existing++; continue; }

    const brandName = clean(r[2]);
    const assigneeName = clean(r[7]);
    const brand = brandName ? brandBy(brandName) : undefined;
    const assignee = assigneeName ? userBy(assigneeName) : undefined;
    if (brandName && !brand) warnings.push(`${code}: brand "${brandName}" not in registry`);
    if (assigneeName && !assignee) warnings.push(`${code}: "${assigneeName}" not in team registry`);

    const delivery = pick(r[19], DELIVERY_STATUSES, "Not Started");
    const lastUpdated = parseDate(r[22]);
    const priority = clean(r[8]);
    const p = await prisma.project.create({
      data: {
        code,
        title,
        addedOn: parseDate(r[1]) ?? new Date(),
        brandId: brand?.id ?? null,
        type: clean(r[4]) || null,
        platform: clean(r[5]) || null,
        dept: pick(r[6], DEPTS, "Post Production"),
        assigneeId: assignee?.id ?? null,
        priority: ["High", "Medium", "Low"].includes(priority) ? priority : "Medium",
        externalDeadline: parseDate(r[9]),
        internalDeadline: parseDate(r[10]),
        briefStage: pick(r[11], BRIEF_STAGES, "Not Started"),
        scriptStage: pick(r[12], SCRIPT_STAGES, "Not Started"),
        preProStage: pick(r[13], PREPRO_STAGES, "Not Started"),
        shootStatus: pick(r[14], SHOOT_STATUSES, "Not Started"),
        editStatus: pick(r[15], EDIT_STATUSES, "Not Started"),
        revisionRound: Number.parseInt(r[16] ?? "", 10) || 0,
        clientReview: pick(r[17], CLIENT_REVIEW, "Pending"),
        finalApproval: pick(r[18], FINAL_APPROVAL, "Pending"),
        deliveryStatus: delivery,
        notes: (r[21] ?? "").trim() || null,
        extDeadlineChanges: Number.parseInt(r[24] ?? "", 10) || 0,
        intDeadlineChanges: Number.parseInt(r[25] ?? "", 10) || 0,
        lastTeamUpdateAt: lastUpdated ?? new Date(),
        closedAt: delivery === "Project Closed" ? lastUpdated ?? new Date() : null,
        statusChangedAt: lastUpdated ?? new Date(),
      },
    });

    // "📝 EDITOR NOTES / LINKS" → update thread. Format: "👤 Name  (04 Jul, 12:17):\ntext"
    const notes = (r[23] ?? "").trim();
    if (notes) {
      const chunks = notes.split(/\n(?=👤)/);
      for (const ch of chunks) {
        const m = ch.match(/^👤\s*(.+?)\s*\((\d{1,2}) ([A-Za-z]{3}), (\d{1,2}):(\d{2})\):\s*\n?([\s\S]*)$/);
        const author = m ? m[1].trim() : assignee?.name ?? "Team";
        const at = m
          ? new Date(Date.UTC((p.addedOn ?? new Date()).getUTCFullYear(), MONTHS[m[3].toLowerCase()] ?? 0, Number(m[2]), Number(m[4]) - 5, Number(m[5]) - 30))
          : lastUpdated ?? new Date();
        const body = (m ? m[6] : ch).trim();
        if (!body) continue;
        await prisma.update.create({
          data: { projectId: p.id, authorName: author, authorId: userBy(author)?.id ?? null, body, createdAt: at },
        });
      }
    }
    await prisma.activity.create({ data: { projectId: p.id, actorName: "Import", field: "Imported from Master sheet" } });
    added++;
  }
  console.log(`Projects: ${added} added, ${existing} already in the app`);
  if (warnings.length) console.log("Warnings:\n  " + warnings.join("\n  "));
}

async function main() {
  console.log(`Reading (read-only) from sheet ${SHEET}…`);
  await importTeam();
  await importBrands();
  await importProjects();
  console.log("Done. The Google Sheets were not modified.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
