import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const OLD_DB_URL =
  "postgresql://postgres.mcthyivbhfwpnvcfjbfg:SachinKawde2026@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const oldPrisma = new PrismaClient({ datasources: { db: { url: OLD_DB_URL } } });

const SHUBHAM_CSV_PATH =
  "/Users/tbmmonkey/Downloads/TBM_Post Production Team_Project Managment_Auto Tracker - Shubham.csv";
const MASTER_DASHBOARD_CSV_PATH =
  "/Users/tbmmonkey/Downloads/TBM_Master Control_Post Production_Project Managment_Auto Tracker - 📊 DASHBOARD.csv";

const PALETTE = [
  "#f06a6a",
  "#f1bd6c",
  "#5da283",
  "#4573d2",
  "#8d84e8",
  "#e362e3",
  "#fd612c",
  "#4ecbc4",
  "#aecf55",
  "#b36bd4",
  "#0052CC",
  "#6554C0",
];

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function clean(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Parses "15-Jul-26", "15 Jul", "24-Jun-26", "3 Jul", "01 Jul", "18 Aug 2026", "23-Jun-26"
function parseFlexibleDate(s: string | undefined): Date | null {
  if (!s) return null;
  const str = s.trim();
  if (!str || str === "—" || str === "-") return null;

  // Pattern 1: 15-Jul-26 or 15-Jul-2026
  let m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, mon, Number(m[1])));
  }

  // Pattern 2: 15 Jul or 15 Jul 2026 or 01 Jul
  m = str.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{2,4}))?/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 2026;
    return new Date(Date.UTC(y, mon, Number(m[1])));
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  console.log("=== STARTING COMPLETE DATA MIGRATION TO NEW SUPABASE DB ===");

  const defaultPasswordHash = await bcrypt.hash("TbmPostProd2026!", 10);

  // 1. MIGRATE USERS FROM OLD DATABASE
  console.log("\n[1/5] Migrating Users from previous database & registry...");
  const oldUsers = await oldPrisma.user.findMany();
  console.log(`Found ${oldUsers.length} users in old database.`);

  for (const u of oldUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        department: u.department,
        role: u.role,
        active: u.active,
        hourlyRate: u.hourlyRate,
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash || defaultPasswordHash,
        department: u.department,
        role: u.role,
        active: u.active,
        hourlyRate: u.hourlyRate || 0,
        createdAt: u.createdAt,
      },
    });
  }

  // Add any missing team members from Master Sheet Team Status
  const masterCsvText = fs.readFileSync(MASTER_DASHBOARD_CSV_PATH, "utf8");
  const masterRows = parseCsv(masterCsvText);

  // Locate TEAM STATUS section in Master Sheet
  const teamStatusStart = masterRows.findIndex((r) =>
    r.some((c) => c.includes("TEAM STATUS"))
  );
  if (teamStatusStart !== -1) {
    // Header is next row: NAME,DEPT,ACTIVE,DONE,LATE...
    for (let i = teamStatusStart + 2; i < masterRows.length; i++) {
      const row = masterRows[i];
      const rawName = row[0];
      if (!rawName || rawName.includes("DELAY TRACKER")) break;
      const name = clean(rawName);
      const dept = clean(row[1]) || "Editor";
      if (!name) continue;

      const email = `${name.toLowerCase().replace(/\s+/g, ".")}` + "@theboredmonkey.com";
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { name: { equals: name, mode: "insensitive" } }],
        },
      });

      if (!existing) {
        console.log(`Adding new team member from Master Sheet: ${name} (${dept})`);
        await prisma.user.create({
          data: {
            name,
            email,
            department: ["Founder", "Creative", "Editor", "Production", "Design Lead"].includes(dept)
              ? dept
              : "Editor",
            role: name.toLowerCase() === "sachin" ? "ADMIN" : "MEMBER",
            active: true,
            passwordHash: defaultPasswordHash,
          },
        });
      }
    }
  }

  // 2. MIGRATE BRANDS
  console.log("\n[2/5] Migrating Brands...");
  const oldBrands = await oldPrisma.brand.findMany({ include: { campaigns: true } });
  for (const b of oldBrands) {
    const brand = await prisma.brand.upsert({
      where: { name: b.name },
      update: {
        color: b.color,
        pocName: b.pocName,
        pocEmail: b.pocEmail,
        repositoryUrl: b.repositoryUrl,
        guidelines: b.guidelines,
      },
      create: {
        id: b.id,
        name: b.name,
        color: b.color,
        pocName: b.pocName,
        pocEmail: b.pocEmail,
        repositoryUrl: b.repositoryUrl,
        guidelines: b.guidelines,
        createdAt: b.createdAt,
      },
    });

    for (const c of b.campaigns) {
      await prisma.campaign.upsert({
        where: { brandId_name: { brandId: brand.id, name: c.name } },
        update: {
          repositoryUrl: c.repositoryUrl,
          budget: c.budget,
          status: c.status,
        },
        create: {
          id: c.id,
          name: c.name,
          brandId: brand.id,
          repositoryUrl: c.repositoryUrl,
          budget: c.budget,
          status: c.status,
          createdAt: c.createdAt,
        },
      });
    }
  }

  // Add brands from Master Sheet BRAND HEALTH section
  const brandHealthStart = masterRows.findIndex((r) =>
    r.some((c) => c.includes("BRAND HEALTH"))
  );
  if (brandHealthStart !== -1) {
    for (let i = brandHealthStart + 2; i < masterRows.length; i++) {
      const row = masterRows[i];
      const rawBrand = row[0];
      if (!rawBrand || rawBrand.includes("ALERTS") || rawBrand.includes("Auto-refreshes")) break;
      const bName = clean(rawBrand);
      if (!bName) continue;

      const existingBrand = await prisma.brand.findFirst({
        where: { name: { equals: bName, mode: "insensitive" } },
      });

      if (!existingBrand) {
        const brandColor = PALETTE[(await prisma.brand.count()) % PALETTE.length];
        console.log(`Adding new brand from Master Sheet: ${bName}`);
        await prisma.brand.create({
          data: {
            name: bName,
            color: brandColor,
          },
        });
      }
    }
  }

  // 3. COPY EXISTING PROJECTS FROM OLD DB
  console.log("\n[3/5] Migrating existing deliverable projects from old database...");
  const oldProjects = await oldPrisma.project.findMany({
    include: {
      subtasks: true,
      updates: true,
      timeEntries: true,
      collaborators: true,
    },
  });
  console.log(`Found ${oldProjects.length} projects in old database.`);

  let copiedCount = 0;
  for (const p of oldProjects) {
    // Ensure brand exists in target
    let targetBrandId = p.brandId;
    if (p.brandId) {
      const b = await prisma.brand.findUnique({ where: { id: p.brandId } });
      if (!b) targetBrandId = null;
    }

    let targetAssigneeId = p.assigneeId;
    if (p.assigneeId) {
      const u = await prisma.user.findUnique({ where: { id: p.assigneeId } });
      if (!u) targetAssigneeId = null;
    }

    const created = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        title: p.title,
        brandId: targetBrandId,
        campaignId: p.campaignId,
        type: p.type,
        workType: p.workType,
        version: p.version,
        cost: p.cost,
        platform: p.platform,
        dept: p.dept,
        assigneeId: targetAssigneeId,
        priority: p.priority,
        externalDeadline: p.externalDeadline,
        internalDeadline: p.internalDeadline,
        startAt: p.startAt,
        endAt: p.endAt,
        briefStage: p.briefStage,
        scriptStage: p.scriptStage,
        preProStage: p.preProStage,
        shootStatus: p.shootStatus,
        editStatus: p.editStatus,
        revisionRound: p.revisionRound,
        clientReview: p.clientReview,
        finalApproval: p.finalApproval,
        deliveryStatus: p.deliveryStatus,
        notes: p.notes,
        context: p.context,
        extDeadlineChanges: p.extDeadlineChanges,
        intDeadlineChanges: p.intDeadlineChanges,
        archived: p.archived,
        closedAt: p.closedAt,
        statusChangedAt: p.statusChangedAt,
        lastTeamUpdateAt: p.lastTeamUpdateAt,
        addedOn: p.addedOn,
      },
      create: {
        id: p.id,
        code: p.code,
        title: p.title,
        brandId: targetBrandId,
        campaignId: p.campaignId,
        type: p.type,
        workType: p.workType,
        version: p.version,
        cost: p.cost,
        platform: p.platform,
        dept: p.dept,
        assigneeId: targetAssigneeId,
        priority: p.priority,
        externalDeadline: p.externalDeadline,
        internalDeadline: p.internalDeadline,
        startAt: p.startAt,
        endAt: p.endAt,
        briefStage: p.briefStage,
        scriptStage: p.scriptStage,
        preProStage: p.preProStage,
        shootStatus: p.shootStatus,
        editStatus: p.editStatus,
        revisionRound: p.revisionRound,
        clientReview: p.clientReview,
        finalApproval: p.finalApproval,
        deliveryStatus: p.deliveryStatus,
        notes: p.notes,
        context: p.context,
        extDeadlineChanges: p.extDeadlineChanges,
        intDeadlineChanges: p.intDeadlineChanges,
        archived: p.archived,
        closedAt: p.closedAt,
        statusChangedAt: p.statusChangedAt,
        lastTeamUpdateAt: p.lastTeamUpdateAt,
        addedOn: p.addedOn,
        createdAt: p.createdAt,
      },
    });

    // Subtasks
    for (const st of p.subtasks) {
      await prisma.subtask.upsert({
        where: { id: st.id },
        update: { done: st.done, title: st.title, dueDate: st.dueDate },
        create: {
          id: st.id,
          projectId: created.id,
          title: st.title,
          assigneeId: st.assigneeId,
          dueDate: st.dueDate,
          done: st.done,
          position: st.position,
        },
      });
    }

    // Time entries
    for (const te of p.timeEntries) {
      await prisma.timeEntry.upsert({
        where: { id: te.id },
        update: { durationMinutes: te.durationMinutes },
        create: {
          id: te.id,
          projectId: created.id,
          userId: te.userId,
          date: te.date,
          durationMinutes: te.durationMinutes,
          workType: te.workType,
          notes: te.notes,
          hourlyRate: te.hourlyRate,
        },
      });
    }

    copiedCount++;
  }
  console.log(`Copied/updated ${copiedCount} projects from previous database.`);

  // 4. INGEST SHUBHAM'S TEAM SHEET
  console.log("\n[4/5] Ingesting Team Sheet (Shubham.csv)...");
  const shubhamUser = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: "Shubham", mode: "insensitive" } },
        { email: { contains: "shubham", mode: "insensitive" } },
      ],
    },
  });

  const shubhamCsvText = fs.readFileSync(SHUBHAM_CSV_PATH, "utf8");
  const shubhamRows = parseCsv(shubhamCsvText);

  // Headers are on row index 2 (row 3 of CSV):
  // PROJECT ID | BRAND | PROJECT TITLE | TYPE | PRIORITY | DEADLINE | CURRENT STAGE | STATUS UPDATE | REVISION ROUND | YOUR NOTES | LAST UPDATED | CONTEXT FROM SACHIN
  let shubhamImported = 0;
  for (let i = 3; i < shubhamRows.length; i++) {
    const row = shubhamRows[i];
    const code = clean(row[0]);
    const bName = clean(row[1]);
    const title = (row[2] ?? "").trim();
    if (!code || !title) continue;

    // Find or create brand
    let brand = await prisma.brand.findFirst({
      where: { name: { equals: bName, mode: "insensitive" } },
    });
    if (!brand && bName) {
      brand = await prisma.brand.create({
        data: {
          name: bName,
          color: PALETTE[(await prisma.brand.count()) % PALETTE.length],
        },
      });
    }

    const type = clean(row[3]) || "Reel";
    const priority = clean(row[4]).toLowerCase().includes("high")
      ? "High"
      : clean(row[4]).toLowerCase().includes("low")
      ? "Low"
      : "Medium";
    const deadline = parseFlexibleDate(row[5]);
    const currentStage = clean(row[6]);
    const statusUpdate = clean(row[7]);
    const revision = parseInt(row[8] ?? "0", 10) || 0;
    const notes = (row[9] ?? "").trim() || null;
    const contextFromSachin = (row[11] ?? "").trim() || null;

    // Normalize edit status & delivery status
    let editStatus = "In Progress";
    let deliveryStatus = "Not Started";

    if (currentStage.includes("Closed") || statusUpdate.includes("Approved") || statusUpdate.includes("Closed")) {
      editStatus = "Final Approved";
      deliveryStatus = "Final Delivered";
    } else if (currentStage.includes("Delivered")) {
      deliveryStatus = "Delivered";
      editStatus = "Final Approved";
    } else if (currentStage.includes("In Review") || statusUpdate.includes("In Review")) {
      editStatus = "In Review";
    } else if (currentStage.includes("First Cut Sent") || statusUpdate.includes("First Cut")) {
      editStatus = "First Cut Ready";
    } else if (statusUpdate.includes("Revision") || currentStage.includes("Revision")) {
      editStatus = "Client Revision";
    } else if (statusUpdate.includes("Not Started")) {
      editStatus = "Not Started";
    }

    const proj = await prisma.project.upsert({
      where: { code },
      update: {
        title,
        brandId: brand?.id ?? null,
        type,
        priority,
        internalDeadline: deadline,
        editStatus,
        deliveryStatus,
        revisionRound: revision,
        notes: notes || undefined,
        context: contextFromSachin || undefined,
        assigneeId: shubhamUser?.id ?? null,
      },
      create: {
        code,
        title,
        brandId: brand?.id ?? null,
        type,
        workType: "Assembly",
        priority,
        internalDeadline: deadline,
        editStatus,
        deliveryStatus,
        revisionRound: revision,
        notes,
        context: contextFromSachin,
        assigneeId: shubhamUser?.id ?? null,
        addedOn: new Date("2026-06-23T00:00:00Z"),
      },
    });

    if (notes) {
      await prisma.update.create({
        data: {
          projectId: proj.id,
          authorName: "Shubham",
          authorId: shubhamUser?.id ?? null,
          body: notes,
        },
      });
    }

    shubhamImported++;
  }
  console.log(`Ingested ${shubhamImported} deliverables from Shubham's sheet.`);

  // 5. INGEST DELAY TRACKER FROM MASTER DASHBOARD
  console.log("\n[5/5] Ingesting Master Control Delay Tracker...");
  const delayStart = masterRows.findIndex((r) =>
    r.some((c) => c.includes("DELAY TRACKER"))
  );

  let delaysImported = 0;
  if (delayStart !== -1) {
    // Header is delayStart + 1: PROJECT TITLE,BRAND,EDITOR,INT. DEADLINE,EXT. DEADLINE,WHO'S LATE,DAYS LATE,CURRENT STATUS...
    for (let i = delayStart + 3; i < masterRows.length; i++) {
      const row = masterRows[i];
      const title = (row[0] ?? "").trim();
      if (!title || title.includes("BRAND HEALTH") || title.includes("Auto-refreshes")) break;

      const bName = clean(row[1]);
      const editorName = clean(row[2]);
      const intDl = parseFlexibleDate(row[3]);
      const extDl = parseFlexibleDate(row[4]);
      const lateType = clean(row[5]); // ⚡ EDITOR DELAY, ⏳ BRAND SLOW, 🔴 OVERDUE
      const currentStatus = clean(row[7]);

      // Find brand
      let brand = bName
        ? await prisma.brand.findFirst({
            where: { name: { equals: bName, mode: "insensitive" } },
          })
        : null;
      if (!brand && bName) {
        brand = await prisma.brand.create({
          data: {
            name: bName,
            color: PALETTE[(await prisma.brand.count()) % PALETTE.length],
          },
        });
      }

      // Find editor
      let editor = editorName
        ? await prisma.user.findFirst({
            where: { name: { contains: editorName, mode: "insensitive" } },
          })
        : null;

      // Find if project already exists by title
      const existingProject = await prisma.project.findFirst({
        where: {
          title: { equals: title, mode: "insensitive" },
          ...(brand ? { brandId: brand.id } : {}),
        },
      });

      if (existingProject) {
        // Update with external/internal deadlines and delay cause
        await prisma.project.update({
          where: { id: existingProject.id },
          data: {
            internalDeadline: intDl || existingProject.internalDeadline,
            externalDeadline: extDl || existingProject.externalDeadline,
            assigneeId: editor ? editor.id : existingProject.assigneeId,
            editStatus: currentStatus && currentStatus !== "—" ? currentStatus : existingProject.editStatus,
          },
        });
      } else {
        // Generate new code
        const count = await prisma.project.count();
        const nextNum = (count + 1).toString().padStart(3, "0");
        const newCode = `TBM-${nextNum}`;

        await prisma.project.create({
          data: {
            code: newCode,
            title,
            brandId: brand?.id ?? null,
            assigneeId: editor?.id ?? null,
            internalDeadline: intDl,
            externalDeadline: extDl,
            priority: lateType.includes("OVERDUE") ? "High" : "Medium",
            editStatus: currentStatus && currentStatus !== "—" ? currentStatus : "In Progress",
            deliveryStatus: "Not Started",
            type: "Reel",
            workType: "Assembly",
            addedOn: new Date("2026-06-25T00:00:00Z"),
          },
        });
      }
      delaysImported++;
    }
  }
  console.log(`Processed ${delaysImported} delayed project entries from Master Control.`);

  // Summary counts in new DB
  const finalUsers = await prisma.user.count();
  const finalBrands = await prisma.brand.count();
  const finalProjects = await prisma.project.count();

  console.log("\n================ MIGRATION COMPLETE ================");
  console.log(`Total Users in New DB:    ${finalUsers}`);
  console.log(`Total Brands in New DB:   ${finalBrands}`);
  console.log(`Total Projects in New DB: ${finalProjects}`);
  console.log("====================================================\n");
}

main()
  .catch((e) => {
    console.error("Migration Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await oldPrisma.$disconnect();
  });

