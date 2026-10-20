import { AlarmClock, CalendarClock, CheckCheck, PauseCircle, RotateCcw, UserX, PenLine } from "lucide-react";

// Saved searches in the sidebar (like Asana). The filters themselves live in
// app/(app)/search/page.tsx.
export const SAVED_SEARCHES = [
  { key: "due-week", label: "Due this week", icon: CalendarClock, adminOnly: false },
  { key: "overdue", label: "Overdue", icon: AlarmClock, adminOnly: false },
  { key: "revision", label: "In revision", icon: RotateCcw, adminOnly: false },
  { key: "on-hold", label: "On hold", icon: PauseCircle, adminOnly: false },
  { key: "completed-week", label: "Completed this week", icon: CheckCheck, adminOnly: false },
  { key: "added-by-me", label: "Tasks I added", icon: PenLine, adminOnly: false },
  { key: "unassigned", label: "Unassigned", icon: UserX, adminOnly: true },
] as const;
export type SavedSearchKey = (typeof SAVED_SEARCHES)[number]["key"];
