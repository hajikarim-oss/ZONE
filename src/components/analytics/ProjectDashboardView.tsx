"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Film,
  Sparkles,
  ArrowUpRight,
  Filter,
  Layers,
  ChevronRight,
  ChevronLeft,
  PieChart as PieChartIcon,
  Activity,
  Flame,
  Award,
  Zap,
  Target,
  Timer,
  FileCheck,
  RotateCcw,
  ShieldAlert,
  Building2,
  X,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  HardDrive,
} from "lucide-react";
import DriveAndProjectSection from "@/components/analytics/DriveAndProjectSection";
import Avatar from "@/components/Avatar";
import { JiraStatusLozenge, JiraIssueKey, JiraIssueTypeIcon } from "@/components/jira/JiraBits";
import { SectionBar, StatStrip, Stat } from "@/components/layout/Page";
import TelemetryInspectorModal, {
  type InspectorPayload,
} from "@/components/analytics/TelemetryInspectorModal";
import type { TaskDTO, PersonDTO, BrandDTO } from "@/lib/dto";
import { boardColumn, isDone } from "@/lib/status";
import { cn, fmtDate } from "@/lib/utils";

type Range = "7d" | "30d" | "90d" | "all";

type Props = {
  tasks: TaskDTO[];
  people: PersonDTO[];
  brands: BrandDTO[];
  brandName?: string | null;
  brandColor?: string | null;
  isStudioWide?: boolean;
};

export default function ProjectDashboardView({
  tasks,
  people,
  brands,
  brandName,
  brandColor,
  isStudioWide = false,
}: Props) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("30d");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [inspectorPayload, setInspectorPayload] = useState<InspectorPayload | null>(null);
  const [rightCardTab, setRightCardTab] = useState<"drives" | "stages">("drives");

  // Dynamic Team Member Chart Controls (Scales to N-members & N-projects)
  const [teamPage, setTeamPage] = useState<number>(0);
  const [teamPageSize] = useState<number>(8);
  const [teamViewMode, setTeamViewMode] = useState<"page" | "scroll">("page");
  const [teamDeptFilter, setTeamDeptFilter] = useState<string>("all");
  const [teamSortBy, setTeamSortBy] = useState<"total" | "active" | "done" | "late" | "alpha">("total");
  const [teamSearch, setTeamSearch] = useState<string>("");

  // Dynamic Brand Radar Controls
  const [brandSearch, setBrandSearch] = useState<string>("");
  const [brandSortBy, setBrandSortBy] = useState<"total" | "pct" | "active" | "hours" | "sla">("total");
  const [brandPage, setBrandPage] = useState<number>(0);
  const brandPageSize = 8;

  // Dynamic Leaderboard Controls
  const [leaderboardSearch, setLeaderboardSearch] = useState<string>("");
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<"done" | "active" | "hours" | "velocity" | "sla">("done");
  const [leaderboardPage, setLeaderboardPage] = useState<number>(0);
  const leaderboardPageSize = 10;

  // Dynamic Delay Radar Controls
  const [delaySearch, setDelaySearch] = useState<string>("");
  const [delayCauseFilter, setDelayCauseFilter] = useState<"all" | "Team Late" | "Client Feedback">("all");
  const [delayPage, setDelayPage] = useState<number>(0);
  const delayPageSize = 8;

  // Time window filtering
  const now = useMemo(() => new Date(), []);
  const windowDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 3650;
  const windowStart = useMemo(() => {
    if (range === "all") return null;
    const d = new Date(now);
    d.setDate(d.getDate() - windowDays);
    return d;
  }, [now, windowDays, range]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedBrandId !== "all" && t.brandId !== selectedBrandId) return false;
      if (selectedAssignee !== "all" && t.assigneeId !== selectedAssignee) return false;
      if (range === "all" || !windowStart) return true;

      const created = new Date(t.addedOn);
      const deadline = t.internalDeadline ? new Date(t.internalDeadline) : null;
      // Included if created in window OR has due date in window
      return created >= windowStart || (deadline && deadline >= windowStart);
    });
  }, [tasks, selectedBrandId, selectedAssignee, range, windowStart]);

  // Overall counts
  const total = filteredTasks.length;
  const completed = filteredTasks.filter((t) => isDone(t));
  const active = filteredTasks.filter((t) => !isDone(t));
  const overdue = active.filter((t) => t.internalDeadline && new Date(t.internalDeadline) < now);
  const inRevision = active.filter(
    (t) => boardColumn(t) === "revision" || t.editStatus?.toLowerCase().includes("revision")
  );
  const inApproval = active.filter(
    (t) => boardColumn(t) === "submitted" || boardColumn(t) === "approval"
  );
  const inProgress = active.filter(
    (t) => boardColumn(t) === "ongoing" || t.editStatus === "In Progress" || t.startAt
  );

  const completionPct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const totalMinutes = filteredTasks.reduce((sum, t) => sum + (t.totalDurationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const onTimePct = total > 0 ? Math.round(((total - overdue.length) / total) * 100) : 100;

  // Quality & Revision Rounds Sentiment (Modeled after Email-System Classification)
  const qualityStats = useMemo(() => {
    const v1Approved = completed.filter((t) => (t.revisionRound || 0) <= 1).length;
    const minorFixes = completed.filter((t) => (t.revisionRound || 0) === 2).length;
    const majorRecut = completed.filter((t) => (t.revisionRound || 0) >= 3).length;

    return [
      {
        key: "first_pass",
        label: "First-Pass Approved",
        sub: "Shipped on v1 with 0-1 fixes",
        count: v1Approved,
        pct: completed.length > 0 ? Math.round((v1Approved / completed.length) * 100) : 75,
        color: "#10b981",
        badge: "Optimal Quality",
      },
      {
        key: "minor_fix",
        label: "Minor Polish (v2)",
        sub: "Single revision round adjustments",
        count: minorFixes,
        pct: completed.length > 0 ? Math.round((minorFixes / completed.length) * 100) : 18,
        color: "#3b82f6",
        badge: "Standard Polish",
      },
      {
        key: "major_recut",
        label: "Major Re-cuts (v3+)",
        sub: "3+ revision iterations",
        count: majorRecut,
        pct: completed.length > 0 ? Math.round((majorRecut / completed.length) * 100) : 7,
        color: "#f59e0b",
        badge: "High Iteration",
      },
      {
        key: "at_risk",
        label: "Late / In Escalation",
        sub: "Overdue past internal SLA",
        count: overdue.length,
        pct: total > 0 ? Math.round((overdue.length / total) * 100) : 0,
        color: "#ef4444",
        badge: overdue.length > 0 ? "Action Required" : "SLA Healthy",
      },
    ];
  }, [completed, overdue.length, total]);

  // Unique departments across the studio
  const teamDepartments = useMemo(() => {
    const depts = new Set<string>();
    people.forEach((p) => {
      if (p.department) depts.add(p.department);
    });
    return Array.from(depts).sort();
  }, [people]);

  // Deliverables by Assignee (Asana Chart 1) + Extended Parameters
  const assigneeStats = useMemo(() => {
    const list = people.map((p) => {
      const pTasks = filteredTasks.filter((t) => t.assigneeId === p.id);
      const done = pTasks.filter((t) => isDone(t)).length;
      const working = pTasks.filter(
        (t) => !isDone(t) && (boardColumn(t) === "ongoing" || t.editStatus === "In Progress" || t.startAt)
      ).length;
      const review = pTasks.filter(
        (t) =>
          !isDone(t) &&
          (boardColumn(t) === "submitted" || boardColumn(t) === "approval" || boardColumn(t) === "revision")
      ).length;
      const late = pTasks.filter(
        (t) => !isDone(t) && t.internalDeadline && new Date(t.internalDeadline) < now
      ).length;
      const mins = pTasks.reduce((s, t) => s + (t.totalDurationMinutes || 0), 0);
      const avgMinsPerVideo = pTasks.length > 0 ? Math.round(mins / pTasks.length) : 0;
      const onTimeScore = pTasks.length > 0 ? Math.round(((pTasks.length - late) / pTasks.length) * 100) : 100;

      // Real-time activity state
      const isLiveNow = pTasks.some((t) => t.editStatus === "In Progress" || (t.startAt && !t.endAt));

      return {
        person: p,
        total: pTasks.length,
        done,
        working,
        review,
        late,
        hours: (mins / 60).toFixed(1),
        avgHoursPerVideo: (avgMinsPerVideo / 60).toFixed(1),
        onTimeScore,
        isLiveNow,
        tasks: pTasks,
      };
    });

    // Unassigned
    const unassignedTasks = filteredTasks.filter((t) => !t.assigneeId);
    if (unassignedTasks.length > 0) {
      list.push({
        person: { id: "__unassigned__", name: "Unassigned Queue", department: "Unallocated", active: true },
        total: unassignedTasks.length,
        done: unassignedTasks.filter((t) => isDone(t)).length,
        working: 0,
        review: unassignedTasks.filter((t) => boardColumn(t) === "submitted").length,
        late: unassignedTasks.filter(
          (t) => !isDone(t) && t.internalDeadline && new Date(t.internalDeadline) < now
        ).length,
        hours: "0.0",
        avgHoursPerVideo: "0.0",
        onTimeScore: 100,
        isLiveNow: false,
        tasks: unassignedTasks,
      });
    }

    return list.filter((a) => a.total > 0);
  }, [filteredTasks, people, now]);

  // Dynamically Processed & Filtered Assignees for the Chart
  const processedAssignees = useMemo(() => {
    let list = [...assigneeStats];

    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase().trim();
      list = list.filter((a) => a.person.name.toLowerCase().includes(q));
    }

    if (teamDeptFilter !== "all") {
      list = list.filter(
        (a) => (a.person.department || "").toLowerCase() === teamDeptFilter.toLowerCase()
      );
    }

    list.sort((a, b) => {
      if (teamSortBy === "total") return b.total - a.total;
      if (teamSortBy === "active") return b.working + b.review - (a.working + a.review);
      if (teamSortBy === "done") return b.done - a.done;
      if (teamSortBy === "late") return b.late - a.late;
      if (teamSortBy === "alpha") return a.person.name.localeCompare(b.person.name);
      return b.total - a.total;
    });

    return list;
  }, [assigneeStats, teamSearch, teamDeptFilter, teamSortBy]);

  const totalTeamPages = Math.max(1, Math.ceil(processedAssignees.length / teamPageSize));
  const currentTeamPage = Math.min(teamPage, totalTeamPages - 1);

  const displayedAssignees = useMemo(() => {
    if (teamViewMode === "scroll") return processedAssignees;
    return processedAssignees.slice(
      currentTeamPage * teamPageSize,
      (currentTeamPage + 1) * teamPageSize
    );
  }, [processedAssignees, teamViewMode, currentTeamPage, teamPageSize]);

  const maxAssigneeCount = useMemo(() => {
    return Math.max(1, ...displayedAssignees.map((a) => a.total));
  }, [displayedAssignees]);

  // Brand Performance Matrix (reactive to current range and assignee filter)
  const brandStats = useMemo(() => {
    return brands
      .map((b) => {
        const bTasks = filteredTasks.filter((t) => t.brandId === b.id);
        const bDone = bTasks.filter((t) => isDone(t)).length;
        const bActive = bTasks.filter((t) => !isDone(t)).length;
        const bLate = bTasks.filter(
          (t) => !isDone(t) && t.internalDeadline && new Date(t.internalDeadline) < now
        ).length;
        const bMins = bTasks.reduce((s, t) => s + (t.totalDurationMinutes || 0), 0);
        const bPct = bTasks.length > 0 ? Math.round((bDone / bTasks.length) * 100) : 0;
        const bSLA = bTasks.length > 0 ? Math.round(((bTasks.length - bLate) / bTasks.length) * 100) : 100;

        return {
          brand: b,
          total: bTasks.length,
          done: bDone,
          active: bActive,
          late: bLate,
          hours: (bMins / 60).toFixed(1),
          pct: bPct,
          sla: bSLA,
        };
      })
      .filter((bs) => (selectedBrandId !== "all" ? bs.brand.id === selectedBrandId : bs.total > 0));
  }, [brands, filteredTasks, now, selectedBrandId]);

  // Dynamically Processed Brands
  const processedBrands = useMemo(() => {
    let list = [...brandStats];

    if (brandSearch.trim()) {
      const q = brandSearch.toLowerCase().trim();
      list = list.filter((b) => b.brand.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      if (brandSortBy === "total") return b.total - a.total;
      if (brandSortBy === "pct") return b.pct - a.pct;
      if (brandSortBy === "active") return b.active - a.active;
      if (brandSortBy === "hours") return parseFloat(b.hours) - parseFloat(a.hours);
      if (brandSortBy === "sla") return b.sla - a.sla;
      return b.total - a.total;
    });

    return list;
  }, [brandStats, brandSearch, brandSortBy]);

  const totalBrandPages = Math.max(1, Math.ceil(processedBrands.length / brandPageSize));
  const currentBrandPage = Math.min(brandPage, totalBrandPages - 1);
  const displayedBrands = useMemo(() => {
    return processedBrands.slice(currentBrandPage * brandPageSize, (currentBrandPage + 1) * brandPageSize);
  }, [processedBrands, currentBrandPage, brandPageSize]);

  // Incomplete Tasks by Stage (Asana Chart 2)
  const stageStats = useMemo(() => {
    const stages = [
      { key: "open", label: "Open / Briefing", color: "#6366f1", targetStatus: "OPEN" },
      { key: "ongoing", label: "Assembly & Rough Cut", color: "#3b82f6", targetStatus: "IN_PROGRESS" },
      { key: "submitted", label: "Sent for Approval", color: "#f59e0b", targetStatus: "SENT_FOR_APPROVAL" },
      { key: "revision", label: "Client Feedback & Fixes", color: "#ec4899", targetStatus: "FEEDBACK" },
      { key: "done", label: "Final Approval & Shipped", color: "#10b981", targetStatus: "DONE" },
    ];

    return stages.map((st) => {
      const match = filteredTasks.filter((t) => boardColumn(t) === st.key);
      return {
        ...st,
        count: match.length,
        pct: total > 0 ? Math.round((match.length / total) * 100) : 0,
      };
    });
  }, [filteredTasks, total]);

  const maxStageCount = useMemo(() => {
    return Math.max(1, ...stageStats.map((s) => s.count));
  }, [stageStats]);

  // Completion Status Donut (Asana Chart 4)
  const donutData = useMemo(() => {
    return [
      { key: "done", label: "Completed", count: completed.length, color: "#10b981", targetStatus: "DONE" },
      { key: "progress", label: "In Assembly/Edit", count: inProgress.length, color: "#3b82f6", targetStatus: "IN_PROGRESS" },
      { key: "review", label: "In Review/Approval", count: inApproval.length + inRevision.length, color: "#f59e0b", targetStatus: "FEEDBACK" },
      { key: "overdue", label: "Overdue SLA", count: overdue.length, color: "#ef4444", targetStatus: "OVERDUE" },
    ];
  }, [completed.length, inProgress.length, inApproval.length, inRevision.length, overdue.length]);

  // Overdue and Delayed Deliverables for Delay & Escalation Radar
  const delays = useMemo(() => {
    return filteredTasks
      .filter((t) => !isDone(t) && t.internalDeadline && new Date(t.internalDeadline) < now)
      .map((t) => {
        const diffMs = now.getTime() - new Date(t.internalDeadline!).getTime();
        const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const isClientDelay =
          boardColumn(t) === "submitted" ||
          boardColumn(t) === "revision" ||
          t.editStatus?.toLowerCase().includes("client") ||
          t.editStatus?.toLowerCase().includes("feedback");
        return {
          t,
          days,
          cause: isClientDelay ? ("Client Feedback" as const) : ("Team Late" as const),
          isSevere: days >= 3,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [filteredTasks, now]);

  // Dynamically Processed Delays
  const processedDelays = useMemo(() => {
    let list = [...delays];

    if (delaySearch.trim()) {
      const q = delaySearch.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.t.title.toLowerCase().includes(q) ||
          d.t.code.toLowerCase().includes(q) ||
          (d.t.brandName || "").toLowerCase().includes(q) ||
          (d.t.assigneeName || "").toLowerCase().includes(q)
      );
    }

    if (delayCauseFilter !== "all") {
      list = list.filter((d) => d.cause === delayCauseFilter);
    }

    return list;
  }, [delays, delaySearch, delayCauseFilter]);

  const totalDelayPages = Math.max(1, Math.ceil(processedDelays.length / delayPageSize));
  const currentDelayPage = Math.min(delayPage, totalDelayPages - 1);
  const displayedDelays = useMemo(() => {
    return processedDelays.slice(currentDelayPage * delayPageSize, (currentDelayPage + 1) * delayPageSize);
  }, [processedDelays, currentDelayPage, delayPageSize]);

  // Dynamically Processed Leaderboard
  const processedLeaderboard = useMemo(() => {
    let list = [...assigneeStats];

    if (leaderboardSearch.trim()) {
      const q = leaderboardSearch.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.person.name.toLowerCase().includes(q) ||
          (a.person.department || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (leaderboardSortBy === "done") return b.done - a.done;
      if (leaderboardSortBy === "active") return b.working + b.review - (a.working + a.review);
      if (leaderboardSortBy === "hours") return parseFloat(b.hours) - parseFloat(a.hours);
      if (leaderboardSortBy === "velocity") return parseFloat(a.avgHoursPerVideo) - parseFloat(b.avgHoursPerVideo);
      if (leaderboardSortBy === "sla") return b.onTimeScore - a.onTimeScore;
      return b.done - a.done;
    });

    return list;
  }, [assigneeStats, leaderboardSearch, leaderboardSortBy]);

  const totalLeaderboardPages = Math.max(1, Math.ceil(processedLeaderboard.length / leaderboardPageSize));
  const currentLeaderboardPage = Math.min(leaderboardPage, totalLeaderboardPages - 1);
  const displayedLeaderboard = useMemo(() => {
    return processedLeaderboard.slice(
      currentLeaderboardPage * leaderboardPageSize,
      (currentLeaderboardPage + 1) * leaderboardPageSize
    );
  }, [processedLeaderboard, currentLeaderboardPage, leaderboardPageSize]);

  // Production Velocity Trend (Asana Chart 3)
  const trendPoints = useMemo(() => {
    const daysCount = range === "7d" ? 7 : range === "30d" ? 14 : range === "90d" ? 12 : 12;
    const stepDays = Math.max(1, Math.floor(windowDays / daysCount));
    const points: { label: string; completed: number; started: number }[] = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * stepDays);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const doneUpToDate = filteredTasks.filter((t) => isDone(t) && new Date(t.updatedAt) <= d).length;
      const startedUpToDate = filteredTasks.filter((t) => new Date(t.addedOn) <= d).length;

      points.push({
        label,
        completed: doneUpToDate,
        started: startedUpToDate,
      });
    }

    return points;
  }, [filteredTasks, now, range, windowDays]);

  const maxTrendVal = useMemo(() => {
    return Math.max(1, ...trendPoints.map((p) => Math.max(p.completed, p.started)));
  }, [trendPoints]);

  // Deliverable formats breakdown
  const formatStats = useMemo(() => {
    const formats: Record<string, { count: number; mins: number }> = {};
    for (const t of filteredTasks) {
      const typeKey = t.workType || t.type || "Reel / Short";
      if (!formats[typeKey]) formats[typeKey] = { count: 0, mins: 0 };
      formats[typeKey].count += 1;
      formats[typeKey].mins += t.totalDurationMinutes || 0;
    }

    return Object.entries(formats)
      .map(([label, data]) => ({
        label,
        count: data.count,
        hours: (data.mins / 60).toFixed(1),
        pct: total > 0 ? Math.round((data.count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredTasks, total]);

  // Donut SVG calculations
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  let strokeDashOffsetAcc = 0;

  // Smooth scroll helper
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Inspector opener for an Editor
  const openEditorInspector = (a: (typeof assigneeStats)[0]) => {
    setInspectorPayload({
      type: "editor",
      title: a.person.name,
      subtitle: `${a.person.department || "Post Production"} · Workload telemetry and efficiency score`,
      badge: a.isLiveNow ? "Working Now (Live)" : a.onTimeScore >= 90 ? "Top Performer" : "Active Editor",
      badgeColor: a.isLiveNow ? "emerald" : a.onTimeScore >= 90 ? "blue" : "amber",
      primaryMetric: {
        label: "On-Time Delivery SLA",
        value: `${a.onTimeScore}%`,
        sub: `${a.done} completed · ${a.working + a.review} in progress`,
        trend: { delta: `${a.hours}h tracked`, isPositive: true },
      },
      breakdown: [
        { label: "Completed Deliverables", value: a.done, pct: a.total > 0 ? (a.done / a.total) * 100 : 0, color: "#10b981" },
        { label: "Active Queue", value: a.working + a.review, pct: a.total > 0 ? ((a.working + a.review) / a.total) * 100 : 0, color: "#3b82f6" },
        { label: "Turnaround Time (Avg)", value: `${a.avgHoursPerVideo} hrs/video`, color: "#8b5cf6" },
        { label: "Late Deliverables", value: a.late, color: a.late > 0 ? "#ef4444" : "#10b981" },
      ],
      insights: [
        `${a.person.name} has shipped ${a.done} deliverables across the studio with a ${a.onTimeScore}% SLA adherence.`,
        a.isLiveNow
          ? "Currently active in a live editing session with synchronized real-time tracking."
          : `Total cumulative production logged time: ${a.hours} hours.`,
      ],
      actionLabel: `View ${a.person.name.split(" ")[0]}'s Deliverables →`,
      onAction: () => {
        if (a.person.id === "__unassigned__") {
          router.push(`/projects`);
        } else {
          router.push(`/projects?assignee=${a.person.id}`);
        }
      },
    });
  };

  // Inspector opener for Quality Sentiment
  const openQualityInspector = (q: (typeof qualityStats)[0]) => {
    setInspectorPayload({
      type: "quality",
      title: q.label,
      subtitle: q.sub,
      badge: q.badge,
      badgeColor: q.key === "first_pass" ? "emerald" : q.key === "minor_fix" ? "blue" : q.key === "major_recut" ? "amber" : "rose",
      primaryMetric: {
        label: "Category Deliverables",
        value: `${q.count} videos`,
        sub: `${q.pct}% of post-production pipeline`,
      },
      breakdown: [
        { label: "Share of Output", value: `${q.pct}%`, pct: q.pct, color: q.color },
        { label: "Category Count", value: q.count, color: q.color },
        { label: "Quality Assessment", value: q.key === "first_pass" ? "Exceptional" : q.key === "at_risk" ? "Urgent Review" : "Nominal", color: q.color },
      ],
      insights: [
        q.key === "first_pass"
          ? "Deliverables approved on the initial cut preserve editing bandwidth and maximize turnaround velocity."
          : q.key === "at_risk"
          ? "Overdue deliverables trigger automated founder alerts to prevent client delivery breaches."
          : "Revision cycles are tracked with internal notes and team notifications to minimize feedback lag.",
      ],
      actionLabel: q.key === "at_risk" ? "Inspect Delayed Deliverables →" : "View Matching Deliverables in Projects →",
      onAction: () => {
        if (q.key === "at_risk") {
          scrollTo("section-delays");
        } else if (q.key === "first_pass" || q.key === "minor_fix") {
          router.push("/projects?status=DONE");
        } else {
          router.push("/projects?status=FEEDBACK");
        }
      },
    });
  };

  const hasActiveFilters = range !== "30d" || selectedBrandId !== "all" || selectedAssignee !== "all";

  return (
    <div className="space-y-6 pb-16">
      {/* Interactive Telemetry Inspector Modal */}
      <TelemetryInspectorModal payload={inspectorPayload} onClose={() => setInspectorPayload(null)} />

      {/* Top Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/90 dark:border-[#2C3B53] pb-3 pt-1">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <BarChart3 className="size-4.5" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-slate-950 dark:text-white leading-tight">
              {brandName ? `${brandName} Analytical Command Center` : "Studio Production Telemetry & Analytics"}
            </h3>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
              Real-time post-production burn-down, editor workload allocation, and turnaround telemetry
            </p>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Brand Filter (if studio-wide) */}
          {isStudioWide && (
            <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] dark:border-[#2C3B53] dark:bg-[#161B22] shadow-2xs">
              <Building2 className="size-3.5 text-slate-400" />
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-medium outline-none cursor-pointer"
              >
                <option value="all">All Brands ({brands.length})</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Assignee Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] dark:border-[#2C3B53] dark:bg-[#161B22] shadow-2xs">
            <Users className="size-3.5 text-slate-400" />
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-medium outline-none cursor-pointer"
            >
              <option value="all">All Team Members ({people.length})</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time Window Buttons (Functional) */}
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-stone-100 p-0.5 dark:bg-white/10">
            {(["7d", "30d", "90d", "all"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "h-6 px-2.5 rounded text-[11px] font-semibold transition cursor-pointer",
                  range === r
                    ? "bg-white text-slate-950 shadow-2xs dark:bg-[#161B22] dark:text-white"
                    : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "All Time"}
              </button>
            ))}
          </div>

          {/* Reset Filters Pill */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedBrandId("all");
                setSelectedAssignee("all");
                setRange("30d");
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-2 py-1 rounded-lg border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 transition cursor-pointer"
              title="Reset all filters to 30 Days and All Brands"
            >
              <X className="size-3" />
              <span>Reset</span>
            </button>
          )}

          <div className="text-[11px] font-mono text-slate-400 shrink-0 hidden lg:block ml-1">
            Showing <span className="font-bold text-slate-900 dark:text-white">{filteredTasks.length}</span> of {tasks.length}
          </div>
        </div>
      </div>

      {/* KPI StatStrip */}
      <div id="section-kpis" className="scroll-mt-14">
        <StatStrip cols={7}>
          <Stat
            label="TOTAL DELIVERABLES"
            value={total}
            sub={`${completionPct}% completion rate`}
            tone="blue"
            href="/projects"
          />
          <Stat
            label="COMPLETED"
            value={completed.length}
            sub="Shipped to client"
            tone="green"
            accent={completed.length > 0}
            href="/projects?status=DONE"
          />
          <Stat
            label="IN PRODUCTION"
            value={inProgress.length}
            sub="Assembly & rough cut"
            tone="blue"
            href="/projects?status=IN_PROGRESS"
          />
          <Stat
            label="UNDER REVIEW"
            value={inApproval.length + inRevision.length}
            sub={`${inRevision.length} revision rounds`}
            tone="amber"
            href="/projects?status=FEEDBACK"
          />
          <Stat
            label="HOURS TRACKED"
            value={`${totalHours}h`}
            sub="Billable work time"
            tone="blue"
            onClick={() => scrollTo("section-leaderboard")}
          />
          <Stat
            label="ON-TIME SLA"
            value={`${onTimePct}%`}
            sub="Schedule adherence"
            tone={onTimePct >= 90 ? "green" : "amber"}
            onClick={() => scrollTo("section-brands")}
          />
          <Stat
            label="PAST DEADLINE"
            value={overdue.length}
            sub={overdue.length > 0 ? "Requires escalation" : "All on schedule"}
            tone={overdue.length > 0 ? "red" : "green"}
            onClick={() => scrollTo("section-delays")}
            last
          />
        </StatStrip>
      </div>

      {/* Deliverable Quality & Review Classification */}
      <div
        id="section-quality"
        className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 dark:border-[#2C3B53] bg-[#FAF9F5]/40 dark:bg-[#0F141C]">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
              PRODUCTION QUALITY &amp; REVISION SENTIMENT CLASSIFICATION
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Click any tile to inspect telemetry and navigate to matching deliverables
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {qualityStats.map((q) => (
            <div
              key={q.key}
              onClick={() => openQualityInspector(q)}
              className="p-3.5 rounded-xl border border-stone-200/80 bg-[#FAF9F5]/30 hover:bg-white hover:border-blue-400 dark:border-white/5 dark:bg-[#0F141C] dark:hover:bg-[#161B22] dark:hover:border-blue-500 transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: q.color }} />
                  <span className="font-bold text-[12.5px] text-slate-900 group-hover:text-blue-600 transition-colors dark:text-white">
                    {q.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[14px] font-extrabold text-slate-950 dark:text-white">
                    {q.count}
                  </span>
                  <span className="text-slate-400 group-hover:text-blue-600 transition-colors text-xs">→</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{q.sub}</p>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                <div
                  style={{ width: `${Math.max(4, q.pct)}%`, backgroundColor: q.color }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10.5px] font-mono text-slate-400 pt-0.5">
                <span>{q.badge}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{q.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Primary 4-Chart Grid (Asana Dashboard layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: Dynamic Deliverables by Team Member (Scales to N-members and N-projects) */}
        <div
          id="section-team"
          className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] flex flex-col justify-between"
        >
          <div>
            {/* Header with Dynamic Controls */}
            <div className="flex flex-col gap-2.5 border-b border-stone-100 dark:border-[#2C3B53] pb-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">
                    Deliverables by Team Member
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[10.5px] font-semibold dark:border-[#2C3B53] dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setTeamViewMode("page")}
                      className={cn(
                        "px-2 py-0.5 rounded transition cursor-pointer",
                        teamViewMode === "page"
                          ? "bg-white text-slate-900 shadow-2xs dark:bg-[#161B22] dark:text-white font-bold"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      )}
                    >
                      Paging (8)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamViewMode("scroll")}
                      className={cn(
                        "px-2 py-0.5 rounded transition cursor-pointer",
                        teamViewMode === "scroll"
                          ? "bg-white text-slate-900 shadow-2xs dark:bg-[#161B22] dark:text-white font-bold"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      )}
                    >
                      Scroll All ({assigneeStats.length})
                    </button>
                  </div>

                  {/* Pagination Chevrons when in paging mode */}
                  {teamViewMode === "page" && totalTeamPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTeamPage((p) => Math.max(0, p - 1))}
                        disabled={currentTeamPage === 0}
                        className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer shadow-2xs"
                        title="Previous team members"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <span className="text-[10.5px] font-mono text-slate-500 min-w-[42px] text-center">
                        {currentTeamPage + 1}/{totalTeamPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTeamPage((p) => Math.min(totalTeamPages - 1, p + 1))}
                        disabled={currentTeamPage >= totalTeamPages - 1}
                        className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer shadow-2xs"
                        title="Next team members"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Filter Pills: Department, Search, and Sort */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                {/* Department Selector */}
                <div className="flex items-center gap-1 overflow-x-auto scroll-thin">
                  <button
                    type="button"
                    onClick={() => {
                      setTeamDeptFilter("all");
                      setTeamPage(0);
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10.5px] font-semibold transition cursor-pointer shrink-0",
                      teamDeptFilter === "all"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    All ({assigneeStats.length})
                  </button>
                  {teamDepartments.map((dept) => {
                    const count = assigneeStats.filter(
                      (a) => (a.person.department || "").toLowerCase() === dept.toLowerCase()
                    ).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => {
                          setTeamDeptFilter(dept);
                          setTeamPage(0);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10.5px] font-semibold transition cursor-pointer shrink-0",
                          teamDeptFilter.toLowerCase() === dept.toLowerCase()
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        )}
                      >
                        {dept} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Search & Sort */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <div className="relative">
                    <Search className="size-3 text-slate-400 absolute left-2 top-1.5" />
                    <input
                      type="text"
                      value={teamSearch}
                      onChange={(e) => {
                        setTeamSearch(e.target.value);
                        setTeamPage(0);
                      }}
                      placeholder="Find editor..."
                      className="h-6 w-24 sm:w-28 rounded-md border border-stone-200 bg-white pl-6 pr-2 text-[10.5px] dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-900 dark:text-white outline-none focus:border-blue-500 shadow-2xs"
                    />
                    {teamSearch && (
                      <button
                        type="button"
                        onClick={() => setTeamSearch("")}
                        className="absolute right-1.5 top-1 text-slate-400 hover:text-slate-700"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <select
                    value={teamSortBy}
                    onChange={(e) => setTeamSortBy(e.target.value as any)}
                    className="h-6 rounded-md border border-stone-200 bg-white px-1.5 text-[10px] font-semibold dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-700 dark:text-slate-300 outline-none cursor-pointer shadow-2xs"
                  >
                    <option value="total">Workload</option>
                    <option value="active">Active Queue</option>
                    <option value="done">Completed</option>
                    <option value="late">Overdue</option>
                    <option value="alpha">A-Z</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Vertical Stacked Bar Chart with Y-Axis Background Guide Lines */}
            <div className="relative mt-4">
              {/* Background Gridlines & Y-axis Scale */}
              <div className="absolute inset-x-0 bottom-16 top-6 pointer-events-none flex flex-col justify-between opacity-35 dark:opacity-20 z-0">
                {[1, 0.75, 0.5, 0.25, 0].map((step) => {
                  const val = Math.round(maxAssigneeCount * step);
                  return (
                    <div key={step} className="flex items-center gap-2 w-full">
                      <span className="text-[9px] font-mono text-slate-400 w-5 text-right shrink-0">
                        {val}
                      </span>
                      <div className="h-px flex-1 border-b border-dashed border-stone-300 dark:border-white/20" />
                    </div>
                  );
                })}
              </div>

              {/* Bars Row */}
              <div
                className={cn(
                  "min-h-[220px] pt-6 pb-2 border-b border-stone-200/60 dark:border-[#2C3B53] relative z-10 pl-6",
                  teamViewMode === "scroll"
                    ? "flex items-end gap-3.5 overflow-x-auto scroll-thin pb-3"
                    : "flex items-end justify-between gap-2.5"
                )}
              >
                {displayedAssignees.length === 0 ? (
                  <div className="w-full py-12 text-center text-xs text-slate-400">
                    No team members found matching "{teamSearch}"
                  </div>
                ) : (
                  displayedAssignees.map((a) => {
                    const heightPct = Math.max(8, Math.round((a.total / maxAssigneeCount) * 100));
                    const doneHeight = a.total > 0 ? (a.done / a.total) * 100 : 0;
                    const workingHeight = a.total > 0 ? (a.working / a.total) * 100 : 0;
                    const lateHeight = a.total > 0 ? (a.late / a.total) * 100 : 0;

                    return (
                      <div
                        key={a.person.id}
                        onClick={() => openEditorInspector(a)}
                        className={cn(
                          "flex flex-col items-center gap-2 group/bar cursor-pointer transition-transform hover:-translate-y-0.5",
                          teamViewMode === "scroll" ? "w-[58px] shrink-0" : "flex-1 min-w-[36px]"
                        )}
                        title={`Click to inspect ${a.person.name} (${a.done} Done, ${a.working + a.review} Active, ${a.late} Late)`}
                      >
                        {/* Bar container */}
                        <div className="w-full max-w-[42px] relative flex flex-col items-center">
                          <span className="text-[10.5px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1 group-hover/bar:text-blue-600 transition-colors">
                            {a.total}
                          </span>
                          <div
                            style={{ height: `${heightPct * 1.5}px` }}
                            className="w-full rounded-t-md overflow-hidden flex flex-col-reverse bg-slate-100 dark:bg-white/5 transition-all group-hover/bar:brightness-110 shadow-2xs border border-transparent group-hover/bar:border-blue-400"
                          >
                            {/* Completed (Emerald) */}
                            <div style={{ height: `${doneHeight}%` }} className="w-full bg-emerald-500 transition-all" />
                            {/* Working (Blue) */}
                            <div style={{ height: `${workingHeight}%` }} className="w-full bg-blue-500 transition-all" />
                            {/* Late (Rose) */}
                            <div style={{ height: `${lateHeight}%` }} className="w-full bg-rose-500 transition-all" />
                          </div>
                        </div>

                        {/* Bottom: Avatar, Name & Live status dot */}
                        <div className="flex flex-col items-center text-center mt-1 w-full">
                          <div className="relative">
                            <Avatar name={a.person.name} size={22} />
                            {a.isLiveNow && (
                              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-1 ring-white animate-pulse" />
                            )}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-full px-0.5 mt-1 group-hover/bar:text-blue-600 transition-colors">
                            {a.person.name.split(" ")[0]}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">{a.hours}h</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Legend & Dynamic Average Metrics */}
          <div className="mt-4 flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-stone-100 dark:border-[#2C3B53]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> Done
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" /> Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" /> Overdue
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10.5px]">
              <span>
                Avg {(total / Math.max(1, displayedAssignees.length)).toFixed(1)} tasks/editor
              </span>
              <button
                type="button"
                onClick={() => scrollTo("section-leaderboard")}
                className="text-blue-600 hover:underline font-semibold cursor-pointer"
              >
                Leaderboard →
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Drive & Project Storage Operations (From TBM Studio Storage Management) / Workflow Stages */}
        {rightCardTab === "drives" ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-1">
              <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100/80 p-0.5 text-[11px] font-semibold dark:border-[#2C3B53] dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => setRightCardTab("drives")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded transition cursor-pointer",
                    rightCardTab === "drives"
                      ? "bg-white text-indigo-600 shadow-2xs dark:bg-[#161B22] dark:text-indigo-400 font-bold"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  )}
                >
                  <HardDrive className="size-3.5" />
                  <span>Drive &amp; Project (42)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightCardTab("stages")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded transition cursor-pointer",
                    rightCardTab !== "drives"
                      ? "bg-white text-purple-600 shadow-2xs dark:bg-[#161B22] dark:text-purple-400 font-bold"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  )}
                >
                  <Layers className="size-3.5" />
                  <span>Pipeline Stages</span>
                </button>
              </div>
              <span className="text-[10.5px] font-mono text-slate-400 hidden sm:inline">
                TBM Studio Storage Management
              </span>
            </div>
            <DriveAndProjectSection compact className="h-full min-h-[460px]" />
          </div>
        ) : (
          <div
            id="section-stages"
            className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#2C3B53] pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100/80 p-0.5 text-[11px] font-semibold dark:border-[#2C3B53] dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setRightCardTab("drives")}
                      className="flex items-center gap-1.5 px-3 py-1 rounded transition cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      <HardDrive className="size-3.5" />
                      <span>Drive &amp; Project (42)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightCardTab("stages")}
                      className="flex items-center gap-1.5 px-3 py-1 rounded transition cursor-pointer bg-white text-purple-600 shadow-2xs dark:bg-[#161B22] dark:text-purple-400 font-bold"
                    >
                      <Layers className="size-3.5" />
                      <span>Pipeline Stages</span>
                    </button>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {active.length} active in pipeline · Click row to land in stage
                </span>
              </div>

              {/* Stage Progress Bars */}
              <div className="mt-4 space-y-3">
                {stageStats.map((st) => (
                  <div
                    key={st.key}
                    onClick={() => router.push(`/projects?status=${st.targetStatus}`)}
                    className="p-1.5 rounded-lg hover:bg-stone-50 dark:hover:bg-white/5 transition cursor-pointer group space-y-1"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                        <span className="size-2 rounded-full" style={{ backgroundColor: st.color }} />
                        <span>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11.5px]">
                        <span className="font-bold text-slate-950 dark:text-white">{st.count}</span>
                        <span className="text-slate-400">({st.pct}%)</span>
                        <span className="text-slate-300 group-hover:text-blue-600 transition-colors">→</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-white/5 overflow-hidden">
                      <div
                        style={{
                          width: `${Math.max(3, (st.count / maxStageCount) * 100)}%`,
                          backgroundColor: st.color,
                        }}
                        className="h-full rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 dark:border-[#2C3B53] flex items-center justify-between text-[11px] text-slate-500">
              <span>Stage bottleneck radar:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {inRevision.length > 0 ? `${inRevision.length} waiting for client fixes` : "Pipeline flowing smoothly"}
              </span>
            </div>
          </div>
        )}

        {/* CHART 3: Cumulative Completion Velocity Over Time (Asana Chart 3) */}
        <div
          id="section-velocity"
          className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#2C3B53] pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">
                  Production Velocity &amp; Burn-Down
                </h4>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <span className="text-emerald-600 font-bold">+{completed.length} Shipped</span>
              </div>
            </div>

            {/* Smooth SVG Area Line Chart */}
            <div className="mt-4 relative h-[180px] w-full">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 160">
                <defs>
                  <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="startedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal grid lines */}
                <line x1="0" y1="40" x2="400" y2="40" stroke="#e2e8f0" strokeDasharray="3 3" opacity="0.6" />
                <line x1="0" y1="90" x2="400" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" opacity="0.6" />
                <line x1="0" y1="140" x2="400" y2="140" stroke="#e2e8f0" strokeDasharray="3 3" opacity="0.6" />

                {/* Started Area Path */}
                {(() => {
                  const points = trendPoints.map((p, idx) => {
                    const x = (idx / (trendPoints.length - 1)) * 400;
                    const y = 140 - (p.started / maxTrendVal) * 120;
                    return `${x},${y}`;
                  });
                  return (
                    <>
                      <path
                        d={`M 0,140 L ${points.join(" L ")} L 400,140 Z`}
                        fill="url(#startedGrad)"
                      />
                      <polyline
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        points={points.join(" ")}
                      />
                    </>
                  );
                })()}

                {/* Completed Area Path */}
                {(() => {
                  const points = trendPoints.map((p, idx) => {
                    const x = (idx / (trendPoints.length - 1)) * 400;
                    const y = 140 - (p.completed / maxTrendVal) * 120;
                    return `${x},${y}`;
                  });
                  return (
                    <>
                      <path
                        d={`M 0,140 L ${points.join(" L ")} L 400,140 Z`}
                        fill="url(#velocityGrad)"
                      />
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        points={points.join(" ")}
                      />
                      {points.map((pt, i) => {
                        const [cx, cy] = pt.split(",");
                        return (
                          <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r="3.5"
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* Date ticks */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
              <span>{trendPoints[0]?.label}</span>
              <span>{trendPoints[Math.floor(trendPoints.length / 2)]?.label}</span>
              <span>{trendPoints[trendPoints.length - 1]?.label}</span>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-stone-100 dark:border-[#2C3B53] flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <span className="size-2 rounded-full bg-emerald-500" /> Completed Delivery
              </span>
              <span className="flex items-center gap-1 font-semibold text-blue-600">
                <span className="size-2 rounded-full bg-blue-500" /> Tasks Introduced
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.push("/projects?status=DONE")}
              className="text-blue-600 hover:underline font-semibold font-mono text-[10.5px] cursor-pointer"
            >
              View shipped items →
            </button>
          </div>
        </div>

        {/* CHART 4: Completion Status Donut Chart (Asana Chart 4) */}
        <div
          id="section-donut"
          className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#2C3B53] pb-3">
              <div className="flex items-center gap-2">
                <PieChartIcon className="size-4 text-amber-500" />
                <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">
                  Total Deliverables by Completion Status
                </h4>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {total} total · Click slice to filter
              </span>
            </div>

            {/* Donut & Legend Container */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
              {/* SVG Donut */}
              <div className="relative size-40 flex items-center justify-center shrink-0">
                <svg className="size-full -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke="#e2e8f0"
                    strokeWidth="16"
                    opacity="0.3"
                  />
                  {donutData.map((slice) => {
                    const pct = total > 0 ? slice.count / total : 0;
                    const dashLength = pct * circumference;
                    const strokeDasharray = `${dashLength} ${circumference - dashLength}`;
                    const currentOffset = strokeDashOffsetAcc;
                    strokeDashOffsetAcc += dashLength;

                    return (
                      <circle
                        key={slice.key}
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="16"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={-currentOffset}
                        strokeLinecap="round"
                        className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                        onMouseEnter={() => setHoveredSlice(slice.label)}
                        onMouseLeave={() => setHoveredSlice(null)}
                        onClick={() => {
                          if (slice.targetStatus === "OVERDUE") {
                            scrollTo("section-delays");
                          } else {
                            router.push(`/projects?status=${slice.targetStatus}`);
                          }
                        }}
                      />
                    );
                  })}
                </svg>

                {/* Center metric */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[24px] font-bold font-mono text-slate-900 dark:text-white leading-none">
                    {completionPct}%
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mt-1">
                    Delivered
                  </span>
                </div>
              </div>

              {/* Legend with counts & percentages */}
              <div className="space-y-2.5 w-full max-w-[200px]">
                {donutData.map((slice) => {
                  const pct = total > 0 ? Math.round((slice.count / total) * 100) : 0;
                  return (
                    <div
                      key={slice.key}
                      onClick={() => {
                        if (slice.targetStatus === "OVERDUE") {
                          scrollTo("section-delays");
                        } else {
                          router.push(`/projects?status=${slice.targetStatus}`);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between text-[11.5px] p-1.5 rounded transition cursor-pointer group",
                        hoveredSlice === slice.label
                          ? "bg-stone-100 dark:bg-white/10"
                          : "hover:bg-stone-50 dark:hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                          {slice.label}
                        </span>
                      </div>
                      <div className="font-mono text-right text-[11px] flex items-center gap-1">
                        <span className="font-bold text-slate-950 dark:text-white mr-0.5">{slice.count}</span>
                        <span className="text-slate-400">({pct}%)</span>
                        <span className="text-slate-300 group-hover:text-blue-600 transition-colors">→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-stone-100 dark:border-[#2C3B53] flex items-center justify-between text-[11px] text-slate-500">
            <span>On-time SLA adherence:</span>
            <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
              {onTimePct}% on schedule
            </span>
          </div>
        </div>
      </div>

      {/* Dedicated Studio Storage Hardware & Project File Operations */}
      <DriveAndProjectSection />

      {/* Brand & Campaign Production Matrix (Scales with search, sort & pagination) */}
      <div
        id="section-brands"
        className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5 dark:border-[#2C3B53] bg-[#FAF9F5]/40 dark:bg-[#0F141C]">
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8C9BAB]">
              BRAND PERFORMANCE &amp; CLIENT SLA RADAR ({brandStats.length} BRANDS)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Brand */}
            <div className="relative">
              <Search className="size-3 text-slate-400 absolute left-2 top-1.5" />
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => {
                  setBrandSearch(e.target.value);
                  setBrandPage(0);
                }}
                placeholder="Search brands..."
                className="h-6 w-28 sm:w-36 rounded-md border border-stone-200 bg-white pl-6 pr-2 text-[10.5px] dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={brandSortBy}
              onChange={(e) => setBrandSortBy(e.target.value as any)}
              className="h-6 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-semibold dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="total">Deliverables</option>
              <option value="pct">Shipped %</option>
              <option value="active">Active Queue</option>
              <option value="hours">Hours</option>
              <option value="sla">SLA</option>
            </select>

            {/* Pagination Controls */}
            {totalBrandPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBrandPage((p) => Math.max(0, p - 1))}
                  disabled={currentBrandPage === 0}
                  className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-[10px] font-mono text-slate-400">
                  {currentBrandPage + 1}/{totalBrandPages}
                </span>
                <button
                  type="button"
                  onClick={() => setBrandPage((p) => Math.min(totalBrandPages - 1, p + 1))}
                  disabled={currentBrandPage >= totalBrandPages - 1}
                  className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                <th className="py-2.5 px-4">Brand / Creative Client</th>
                <th className="py-2.5 text-right">Total Deliverables</th>
                <th className="py-2.5 text-right">Shipped %</th>
                <th className="py-2.5 text-right">Active Queue</th>
                <th className="py-2.5 text-right">Hours Tracked</th>
                <th className="py-2.5 px-4 text-right">SLA Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
              {displayedBrands.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No brands found matching "{brandSearch}"
                  </td>
                </tr>
              ) : (
                displayedBrands.map((bs) => (
                  <tr
                    key={bs.brand.id}
                    onClick={() => router.push(`/brands/${bs.brand.id}`)}
                    className="hover:bg-slate-50 dark:hover:bg-[#0F141C] transition cursor-pointer group"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex size-6 items-center justify-center rounded font-bold text-white text-[11px] shadow-2xs shrink-0"
                            style={{ backgroundColor: bs.brand.color || "#6366f1" }}
                          >
                            {bs.brand.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors dark:text-white">
                            {bs.brand.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 group-hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100">
                          Open workspace →
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      {bs.total}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                          <div style={{ width: `${bs.pct}%` }} className="h-full bg-emerald-500 rounded-full" />
                        </div>
                        <span className="font-bold text-emerald-600">{bs.pct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {bs.active}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {bs.hours} hrs
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold font-mono inline-block",
                          bs.sla >= 90
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : bs.sla >= 75
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        )}
                      >
                        {bs.sla}% SLA
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Column Section: Format Mix & Extended Editor Leaderboard (Dynamic Scaling) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deliverable Formats & Hours Breakdown */}
        <div
          id="section-format"
          className="scroll-mt-14 lg:col-span-1 rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]"
        >
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#2C3B53] pb-3">
            <div className="flex items-center gap-2">
              <Film className="size-4 text-indigo-600 dark:text-indigo-400" />
              <h4 className="text-[14px] font-bold text-slate-900 dark:text-white">
                Deliverable Format Mix
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-400">{formatStats.length} types</span>
          </div>

          <div className="mt-4 space-y-3">
            {formatStats.map((f) => (
              <div
                key={f.label}
                onClick={() => router.push(`/projects?type=${encodeURIComponent(f.label)}`)}
                className="p-2.5 rounded-lg border border-stone-100 dark:border-white/5 bg-[#FAF9F5]/50 hover:bg-white dark:bg-[#0F141C] dark:hover:bg-[#161B22] space-y-1 transition cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px] group-hover:text-blue-600 transition-colors">
                    {f.label}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[11.5px] font-bold text-slate-900 dark:text-white">
                    <span>{f.count} vids · {f.hours}h</span>
                    <span className="text-slate-300 group-hover:text-blue-600 transition-colors">→</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                  <div style={{ width: `${f.pct}%` }} className="h-full bg-indigo-500 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor Leaderboard & Productivity Radar (Searchable, sortable, scalable) */}
        <div
          id="section-leaderboard"
          className="scroll-mt-14 lg:col-span-2 rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5 dark:border-[#2C3B53] bg-[#FAF9F5]/40 dark:bg-[#0F141C]">
            <div className="flex items-center gap-2">
              <Award className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8C9BAB]">
                EDITOR PRODUCTIVITY &amp; VELOCITY RADAR ({assigneeStats.length} ACTIVE)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Leaderboard Search */}
              <div className="relative">
                <Search className="size-3 text-slate-400 absolute left-2 top-1.5" />
                <input
                  type="text"
                  value={leaderboardSearch}
                  onChange={(e) => {
                    setLeaderboardSearch(e.target.value);
                    setLeaderboardPage(0);
                  }}
                  placeholder="Filter team..."
                  className="h-6 w-24 sm:w-32 rounded-md border border-stone-200 bg-white pl-6 pr-2 text-[10.5px] dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              {/* Sort by */}
              <select
                value={leaderboardSortBy}
                onChange={(e) => setLeaderboardSortBy(e.target.value as any)}
                className="h-6 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-semibold dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="done">Shipped</option>
                <option value="active">Active Queue</option>
                <option value="hours">Hours</option>
                <option value="velocity">Fastest Turnaround</option>
                <option value="sla">On-Time SLA</option>
              </select>

              {/* Pagination */}
              {totalLeaderboardPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLeaderboardPage((p) => Math.max(0, p - 1))}
                    disabled={currentLeaderboardPage === 0}
                    className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-slate-400">
                    {currentLeaderboardPage + 1}/{totalLeaderboardPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeaderboardPage((p) => Math.min(totalLeaderboardPages - 1, p + 1))}
                    disabled={currentLeaderboardPage >= totalLeaderboardPages - 1}
                    className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                  <th className="py-2.5 px-4">Editor &amp; Status</th>
                  <th className="py-2.5 text-right">Shipped</th>
                  <th className="py-2.5 text-right">Active</th>
                  <th className="py-2.5 text-right">Total Hours</th>
                  <th className="py-2.5 text-right">Turnaround</th>
                  <th className="py-2.5 px-4 text-right">On-Time SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
                {displayedLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      No editors found matching "{leaderboardSearch}"
                    </td>
                  </tr>
                ) : (
                  displayedLeaderboard.map((a) => (
                    <tr
                      key={a.person.id}
                      onClick={() => {
                        if (a.person.id === "__unassigned__") {
                          router.push("/projects");
                        } else {
                          router.push(`/projects?assignee=${a.person.id}`);
                        }
                      }}
                      className="hover:bg-slate-50 dark:hover:bg-[#0F141C] transition cursor-pointer group"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Avatar name={a.person.name} size={24} />
                            {a.isLiveNow && (
                              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-1 ring-white animate-pulse" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors dark:text-white">
                                {a.person.name}
                              </span>
                              {a.isLiveNow ? (
                                <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
                                  Live Now
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {a.person.department || "Editor"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-emerald-600 tabular-nums">
                        {a.done}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {a.working + a.review}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {a.hours} hrs
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-500 tabular-nums">
                        {a.avgHoursPerVideo}h / vid
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold font-mono inline-block",
                            a.onTimeScore >= 90
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : a.onTimeScore >= 75
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          )}
                        >
                          {a.onTimeScore}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delay & Escalation Radar Section (Searchable, filterable, scalable) */}
      <div
        id="section-delays"
        className="scroll-mt-14 rounded-xl border border-stone-200/90 bg-white overflow-hidden shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5 dark:border-[#2C3B53] bg-[#FAF9F5]/40 dark:bg-[#0F141C]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-3.5 text-rose-600 dark:text-rose-400" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8C9BAB]">
              DELAY &amp; ESCALATION RADAR ({delays.length} OVERDUE)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Delay */}
            <div className="relative">
              <Search className="size-3 text-slate-400 absolute left-2 top-1.5" />
              <input
                type="text"
                value={delaySearch}
                onChange={(e) => {
                  setDelaySearch(e.target.value);
                  setDelayPage(0);
                }}
                placeholder="Search delayed..."
                className="h-6 w-28 sm:w-36 rounded-md border border-stone-200 bg-white pl-6 pr-2 text-[10.5px] dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-900 dark:text-white outline-none focus:border-rose-500"
              />
            </div>

            {/* Filter Cause */}
            <select
              value={delayCauseFilter}
              onChange={(e) => setDelayCauseFilter(e.target.value as any)}
              className="h-6 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-semibold dark:border-[#2C3B53] dark:bg-[#0F141C] text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">All Causes</option>
              <option value="Team Late">Team Late</option>
              <option value="Client Feedback">Client Feedback</option>
            </select>

            {/* Pagination Controls */}
            {totalDelayPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDelayPage((p) => Math.max(0, p - 1))}
                  disabled={currentDelayPage === 0}
                  className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-[10px] font-mono text-slate-400">
                  {currentDelayPage + 1}/{totalDelayPages}
                </span>
                <button
                  type="button"
                  onClick={() => setDelayPage((p) => Math.min(totalDelayPages - 1, p + 1))}
                  disabled={currentDelayPage >= totalDelayPages - 1}
                  className="size-6 rounded border border-stone-200 bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-stone-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 cursor-pointer"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {delays.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-slate-400">
            <CheckCircle2 className="size-6 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">All deliverables on schedule</p>
            <p className="text-[11.5px] text-slate-400 mt-0.5">No deliverables in the active queue have passed their SLA deadline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-stone-100 bg-[#FAF9F5]/40 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-[#2C3B53] dark:bg-[#0F141C]">
                  <th className="py-2 px-4">Deliverable</th>
                  <th className="py-2">Brand &amp; Campaign</th>
                  <th className="py-2">Assignee</th>
                  <th className="py-2">Team Due</th>
                  <th className="py-2">Delay Cause</th>
                  <th className="py-2 text-right">Days Overdue</th>
                  <th className="py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2C3B53]">
                {displayedDelays.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      No delayed deliverables found matching "{delaySearch}"
                    </td>
                  </tr>
                ) : (
                  displayedDelays.map(({ t, days, cause, isSevere }) => (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/projects?task=${t.id}`)}
                      className={cn(
                        "transition cursor-pointer group",
                        isSevere
                          ? "hover:bg-rose-50/60 dark:hover:bg-rose-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-[#0F141C]"
                      )}
                    >
                      <td className="py-2.5 px-4 max-w-[280px]">
                        <div className="flex items-center gap-2">
                          <JiraIssueTypeIcon type={t.type} />
                          <JiraIssueKey code={t.code} />
                          <span
                            className="font-semibold text-slate-900 group-hover:text-blue-600 group-hover:underline truncate dark:text-white text-[12.5px]"
                            title={t.title}
                          >
                            {t.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-500">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{t.brandName ?? "—"}</span>
                        {t.campaignName && (
                          <span className="text-[10px] block text-purple-600 dark:text-purple-400 font-semibold truncate max-w-[130px]">
                            {t.campaignName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {t.assigneeName ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={t.assigneeName} size={18} />
                            <span className="text-slate-900 dark:text-white font-medium">{t.assigneeName}</span>
                          </div>
                        ) : (
                          <span className="font-bold text-rose-600">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-500 font-medium">{fmtDate(t.internalDeadline) || "—"}</td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border",
                            cause === "Team Late"
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                              : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                          )}
                        >
                          {isSevere && <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />}
                          {cause}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold tabular-nums">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px]",
                            isSevere
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-extrabold"
                              : "text-rose-600 dark:text-rose-400"
                          )}
                        >
                          +{days}d
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <JiraStatusLozenge status={t.deliveryStatus || t.editStatus} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
