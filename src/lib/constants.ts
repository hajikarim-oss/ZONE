// Dropdown values, copied 1:1 from the data-validation rules on the Master
// sheet's PROJECTS tab so imported rows keep their exact values.

export const ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;
export type Role = (typeof ROLES)[number] | "CLIENT";

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Team member",
  CLIENT: "Client",
};

export const DEPARTMENTS = ["Founder", "Creative", "Editor", "Production", "Design Lead"] as const;

export const TYPES = [
  "DVC", "Reel", "YT Video", "Static", "Ad Film", "Carousel", "Photography",
  "UGC", "YT shorts", "AI Film", "Meta Ads", "Social Content",
];

// Separate work types (actions / sessions / stages of work)
export const WORK_TYPES = [
  "Run", "Pause", "Scripting", "Assembly Edit", "Rough Cut", "Fine Cut",
  "Color Grading", "Sound Design", "Motion Graphics", "Feedback Revisions",
  "Export & Delivery", "Other",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const PIPELINE_STAGES = [
  "Open",
  "Submitted",
  "Sent for approval",
  "Feedback",
  "Done",
  "Reopened",
  "On hold",
] as const;

export const PLATFORMS = [
  "Instagram", "YouTube", "Instagram + YouTube", "WhatsApp", "Website", "OTT",
  "YouTube Shorts", "AI Demo",
];

export const DEPTS = ["Creative", "Post Production", "Production"];

export const PRIORITIES = ["High", "Medium", "Low"] as const;

export const BRIEF_STAGES = ["Not Started", "Brief Received", "Brief Call Done"];
export const SCRIPT_STAGES = ["Not Started", "In Progress", "Sent to Client", "Approved"];
export const PREPRO_STAGES = ["Not Started", "In Progress", "Complete"];
export const SHOOT_STATUSES = ["Not Started", "Scheduled", "Done", "Footage Received"];
export const EDIT_STATUSES = [
  "Not Started",
  "In Progress",
  "First Cut Ready",
  "First Cut Sent",
  "In Review",
  "Internal Revision R1",
  "Internal Revision R2",
  "Internal Revision R3",
  "Internal Revision R4",
  "External Revision R1",
  "External Revision R2",
  "External Revision R3",
  "External Revision R4",
  "Final Approved",
];
export const REVISION_ROUNDS = [0, 1, 2, 3, 4];
export const CLIENT_REVIEW = ["Pending", "Received", "NA"];
export const FINAL_APPROVAL = ["Pending", "Approved", "NA"];
export const DELIVERY_STATUSES = ["Not Started", "Files Sent", "Invoice Raised", "Project Closed"];

// Tunables for the automations (were constants at the top of the Apps Script)
export const STALE_DAYS = 1; // days without an update before a reminder
export const ESCALATE_AFTER = 3; // reminders before admins are CC'd
export const DEADLINE_ALERT_DAYS = 3; // heads-up this many days before internal deadline
export const BRAND_NUDGE_DAYS = 2; // days a cut can sit with the brand before nudging the POC
export const ARCHIVE_AFTER_DAYS = 30; // closed projects auto-archive after this
export const REVISION_ALERT_ROUND = 3; // alert admins when a project hits this round
