import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const META_FILE = path.join(process.cwd(), "src/data/portal-extended-meta.json");
const STORAGE_FILE = path.join(process.cwd(), "src/data/storage-management.json");

type DirectCostItem = {
  id: string;
  title: string;
  category: "AI Credits" | "Stock Music/Footage" | "Freelancer" | "Rentals/Hard Drive" | "Travel" | "Other";
  amount: number;
  receiptUrl?: string;
  addedBy: string;
  createdAt: string;
};

type ProjectCostConfig = {
  budget: number;
  plannedHours: number;
  plannedDirectCost: number;
  overheadRate: number; // default 100 ₹/hr
  directCosts: DirectCostItem[];
};

type SubtaskExtra = {
  description?: string;
  reporter?: string;
  campaign?: string;
  priority?: string;
};

type PortalMetaStore = {
  projectCosts: Record<string, ProjectCostConfig>;
  subtaskExtras: Record<string, SubtaskExtra>;
  userMonthlyCosts: Record<string, { monthlyCost: number; productiveHours: number }>;
  globalOverhead: { monthlySharedCosts: number; totalTeamHours: number; rate: number };
};

function readMetaStore(): PortalMetaStore {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
    }
  } catch {}
  return {
    projectCosts: {},
    subtaskExtras: {},
    userMonthlyCosts: {},
    globalOverhead: { monthlySharedCosts: 200000, totalTeamHours: 2000, rate: 100 },
  };
}

function writeMetaStore(store: PortalMetaStore) {
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(store, null, 2));
}

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const store = readMetaStore();

  const isAdmin = me.role === "ADMIN";

  if (projectId) {
    const costConfig = store.projectCosts[projectId] || {
      budget: 50000,
      plannedHours: 40,
      plannedDirectCost: 10000,
      overheadRate: store.globalOverhead.rate || 100,
      directCosts: [],
    };

    return NextResponse.json({
      costConfig: isAdmin
        ? costConfig
        : {
            // Point 10 Privacy: Team members see budget % and hours, not sensitive rupee salary breakdowns
            budget: costConfig.budget,
            plannedHours: costConfig.plannedHours,
            plannedDirectCost: costConfig.plannedDirectCost,
            overheadRate: costConfig.overheadRate,
            directCosts: costConfig.directCosts,
          },
      subtaskExtras: store.subtaskExtras,
      globalOverhead: store.globalOverhead,
      userMonthlyCosts: isAdmin ? store.userMonthlyCosts : {},
    });
  }

  return NextResponse.json({
    store: isAdmin ? store : { subtaskExtras: store.subtaskExtras, globalOverhead: store.globalOverhead },
  });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const store = readMetaStore();

  // 1. Update Subtask Extra Fields (Point 4)
  if (body.action === "updateSubtaskExtra") {
    const { subtaskId, extra } = body;
    if (subtaskId) {
      store.subtaskExtras[subtaskId] = {
        ...(store.subtaskExtras[subtaskId] || {}),
        ...extra,
      };
      writeMetaStore(store);
    }
    return NextResponse.json({ ok: true, extra: store.subtaskExtras[subtaskId] });
  }

  // 2. Update Project Budget / Planned Cost (Point 10)
  if (body.action === "updateProjectCostConfig") {
    const { projectId, budget, plannedHours, plannedDirectCost, overheadRate } = body;
    if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    const existing = store.projectCosts[projectId] || {
      budget: 50000,
      plannedHours: 40,
      plannedDirectCost: 10000,
      overheadRate: store.globalOverhead.rate || 100,
      directCosts: [],
    };
    store.projectCosts[projectId] = {
      ...existing,
      budget: budget !== undefined ? Number(budget) : existing.budget,
      plannedHours: plannedHours !== undefined ? Number(plannedHours) : existing.plannedHours,
      plannedDirectCost: plannedDirectCost !== undefined ? Number(plannedDirectCost) : existing.plannedDirectCost,
      overheadRate: overheadRate !== undefined ? Number(overheadRate) : existing.overheadRate,
    };
    if (budget !== undefined) {
      await prisma.project.update({ where: { id: projectId }, data: { cost: Number(budget) } }).catch(() => {});
    }
    writeMetaStore(store);
    return NextResponse.json({ ok: true, costConfig: store.projectCosts[projectId] });
  }

  // 3. Add Direct Cost Item (AI credits, stock footage, freelancers, rentals, travel) (Point 10)
  if (body.action === "addDirectCost") {
    const { projectId, title, category, amount, receiptUrl } = body;
    if (!projectId || !title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const existing = store.projectCosts[projectId] || {
      budget: 50000,
      plannedHours: 40,
      plannedDirectCost: 10000,
      overheadRate: store.globalOverhead.rate || 100,
      directCosts: [],
    };
    const newItem: DirectCostItem = {
      id: `dc-${Date.now()}`,
      title: String(title).trim(),
      category: category || "AI Credits",
      amount: Number(amount) || 0,
      receiptUrl: receiptUrl ? String(receiptUrl).trim() : undefined,
      addedBy: me.name,
      createdAt: new Date().toISOString(),
    };
    existing.directCosts = [...existing.directCosts, newItem];
    store.projectCosts[projectId] = existing;
    writeMetaStore(store);
    return NextResponse.json({ ok: true, costConfig: existing });
  }

  // 4. Delete Direct Cost Item
  if (body.action === "deleteDirectCost") {
    const { projectId, costId } = body;
    const existing = store.projectCosts[projectId];
    if (existing) {
      existing.directCosts = existing.directCosts.filter((c) => c.id !== costId);
      store.projectCosts[projectId] = existing;
      writeMetaStore(store);
    }
    return NextResponse.json({ ok: true, costConfig: existing });
  }

  // 5. Import / Sync Storage Management from Google Sheet or CSV (Point 1)
  if (body.action === "importStorageCsv") {
    const { csvText, sheetUrl } = body;
    let rawCsv = csvText || "";

    if (!rawCsv && sheetUrl) {
      const m = String(sheetUrl).match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (m) {
        const gidMatch = String(sheetUrl).match(/gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : "0";
        const exportUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
        const res = await fetch(exportUrl);
        if (res.ok) rawCsv = await res.text();
      }
    }

    if (!rawCsv) {
      const defaultCsvPath = "/Users/tbmmonkey/Downloads/TBM Studio Storage Management - ADMIN.csv";
      if (fs.existsSync(defaultCsvPath)) {
        rawCsv = fs.readFileSync(defaultCsvPath, "utf8");
      }
    }

    if (!rawCsv) {
      return NextResponse.json({ error: "Could not read CSV or Google Sheet data" }, { status: 400 });
    }

    // Parse CSV
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < rawCsv.length; i++) {
      const c = rawCsv[i];
      if (inQ) {
        if (c === '"' && rawCsv[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (c !== "\r") cell += c;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }

    const items = rows
      .slice(1)
      .map((r, idx) => ({
        id: `sm-${idx + 1}`,
        task: (r[0] || "").trim(),
        startDate: (r[1] || "").trim() || null,
        endDate: (r[2] || "").trim() || null,
        progress: (r[3] || "").trim() || "Completed",
        reviewer: (r[4] || "").trim() || null,
        storageName: (r[5] || "").trim() || "Unassigned",
        dataLocation: (r[6] || "").trim() || null,
        outputLink: (r[7] || "").trim() || null,
      }))
      .filter((item) => item.task || item.storageName !== "Unassigned" || item.dataLocation);

    fs.writeFileSync(STORAGE_FILE, JSON.stringify(items, null, 2));

    // Sync Master List of Hard Drive Names into Prisma Storage table
    const driveNames = Array.from(
      new Set(items.map((i) => i.storageName).filter((n) => n && n !== "Unassigned"))
    );

    const syncedDrives: { id: string; name: string; createdAt: Date }[] = [];
    for (const dName of driveNames) {
      const s = await prisma.storage.upsert({
        where: { name: dName },
        update: {},
        create: { name: dName },
      });
      syncedDrives.push(s);
    }

    return NextResponse.json({
      ok: true,
      importedCount: items.length,
      drivesCount: syncedDrives.length,
      drives: syncedDrives,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
