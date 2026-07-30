export type Stage =
  | "cold-lead"
  | "hot-lead"
  | "under-development"
  | "commissioned"
  | "cancelled";

/** Always-visible kanban columns */
export const BOARD_STAGES: Stage[] = [
  "cold-lead",
  "hot-lead",
  "under-development",
  "commissioned",
];

/** All valid stages (including cancelled) */
export const STAGES: Stage[] = [...BOARD_STAGES, "cancelled"];

export const STAGE_LABELS: Record<Stage, string> = {
  "cold-lead": "Cold Lead",
  "hot-lead": "Hot Lead",
  "under-development": "Under Development",
  commissioned: "Commissioned",
  cancelled: "Cancelled",
};

/** Map legacy stage ids (and unknown values) onto the current set. */
export function normalizeStage(value: string | null | undefined): Stage {
  if (value === "new-lead") return "cold-lead";
  if (
    value === "cold-lead" ||
    value === "hot-lead" ||
    value === "under-development" ||
    value === "commissioned" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "cold-lead";
}

export type Series = "Z Series" | "E Series" | "Custom";

export type Market =
  | "Cement"
  | "Power Plants"
  | "Funding"
  | "Clean H2"
  | "Burner Optimisation"
  | "Tenders";

export const MARKETS: Market[] = [
  "Cement",
  "Power Plants",
  "Funding",
  "Clean H2",
  "Burner Optimisation",
  "Tenders",
];

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
}

/**
 * Default team roster used when no DB / local list exists yet.
 * Live data lives in Supabase `team_members` (or localStorage without DB).
 */
export const TEAM_MEMBERS: TeamMember[] = [
  { id: "u-andrew", name: "Andrew" },
  { id: "u-maria", name: "Maria" },
  { id: "u-daniel", name: "Daniel" },
  { id: "u-irina", name: "Irina" },
];

export interface ProjectComment {
  id: string;
  text: string;
  /** Display name of the author at the time of posting */
  author: string;
  /** Team member id when posted by a selected app user */
  authorUserId?: string;
  createdAt: string; // ISO
  /** Present when the comment also moved the project to a new stage */
  stageChange?: Stage;
}

export type TodoKind = "question" | "our-action" | "client-action";

export const TODO_KINDS: TodoKind[] = [
  "question",
  "our-action",
  "client-action",
];

export const TODO_KIND_LABELS: Record<TodoKind, string> = {
  question: "Questions to Clear",
  "our-action": "Action Items (Us)",
  "client-action": "Action Items (Client)",
};

export interface ProjectContact {
  id: string;
  /** All details are optional — capture whatever is known */
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  createdAt: string; // ISO
}

export type ProjectFileKind = "offer" | "financial-model" | "other";

export const PROJECT_FILE_KINDS: ProjectFileKind[] = [
  "offer",
  "financial-model",
  "other",
];

export const PROJECT_FILE_KIND_LABELS: Record<ProjectFileKind, string> = {
  offer: "Offer",
  "financial-model": "Financial model",
  other: "Other",
};

/** Attachment on a project (offer, model, PDF, etc.) */
export interface ProjectFile {
  id: string;
  /** Original filename as uploaded */
  name: string;
  /** MIME type from the browser, when known */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  kind: ProjectFileKind;
  /** Optional short note shown in the list */
  note?: string;
  /** Storage object path (Supabase) or local blob key */
  storagePath: string;
  /** Team member who uploaded, when known */
  uploadedByUserId?: string;
  /** Display name snapshot of uploader */
  uploadedByName?: string;
  createdAt: string; // ISO
  /**
   * Local-only data URL / base64 payload used when Supabase Storage is unavailable.
   * Never sent to the database.
   */
  localDataUrl?: string;
}

/** Project timeline milestones (dates optional until known) */
export type MilestoneKind =
  | "contract-signed"
  | "fat"
  | "sat"
  | "commissioned"
  | "engineering-done"
  | "manufacturing-done";

export const MILESTONE_KINDS: MilestoneKind[] = [
  "contract-signed",
  "engineering-done",
  "manufacturing-done",
  "fat",
  "sat",
  "commissioned",
];

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  "contract-signed": "Contract signed",
  fat: "FAT",
  sat: "SAT",
  commissioned: "Commissioned",
  "engineering-done": "Engineering done",
  "manufacturing-done": "Manufacturing done",
};

/** A scheduled (or received) payment on the project */
export interface ProjectPayment {
  id: string;
  /** Absolute amount expected / received */
  amount: number;
  /** Share of contract value, e.g. 75 for 75% */
  percent?: number;
  /** Expected date (yyyy-mm-dd). When linked to a milestone, mirrors that date. */
  dueDate: string;
  label?: string;
  /** Optional link to a project deadline — both share the same date on the timeline */
  milestoneId?: string;
  createdAt: string; // ISO
}

/** A scheduled project cost / outflow */
export interface ProjectExpenseItem {
  id: string;
  amount: number;
  /** Share of contract value, e.g. 40 for 40% */
  percent?: number;
  /** Expected date (yyyy-mm-dd). When linked to a milestone, mirrors that date. */
  dueDate: string;
  label?: string;
  milestoneId?: string;
  createdAt: string; // ISO
}

export interface ProjectMilestone {
  id: string;
  kind: MilestoneKind;
  /** Expected / actual date (yyyy-mm-dd) */
  date: string;
  note?: string;
  createdAt: string; // ISO
}

/** All financial fields are optional */
export interface ProjectFinancials {
  /** Total contract / project value */
  contractValue?: number;
  /** Expected date the contract will be signed (yyyy-mm-dd) */
  contractSignedDate?: string;
  /** Overall construction + development costs for the project */
  expenses?: number;
  /**
   * Expected profit = contract value − overall expenses.
   * Kept in sync whenever those two fields change.
   */
  expectedProfit?: number;
  payments: ProjectPayment[];
  /** Dated cost outflows used on the portfolio cash chart */
  expenseSchedule: ProjectExpenseItem[];
  milestones: ProjectMilestone[];
}

export function emptyFinancials(): ProjectFinancials {
  return { payments: [], expenseSchedule: [], milestones: [] };
}

export interface ProjectTodo {
  id: string;
  kind: TodoKind;
  text: string;
  /** The answer, for "question" items */
  answer?: string;
  done: boolean;
  /** Date (yyyy-mm-dd) the item should be completed by */
  dueDate?: string;
  /** Team member responsible for this item */
  ownerUserId?: string;
  createdAt: string; // ISO
  /** Set when the item was checked off */
  doneAt?: string; // ISO
}

export interface Project {
  id: string;
  name: string;
  client: string;
  country: string;
  city: string;
  series: Series;
  market: Market;
  /** Electrolyser system size in kW */
  sizeKw: number;
  stage: Stage;
  /** The original description written when the project was created */
  baseDescription: string;
  /** AI-generated living summary, refreshed after each new comment */
  aiSummary?: string;
  /**
   * Last time we contacted / emailed the client (yyyy-mm-dd).
   * Defaults to the project creation date when unset.
   */
  lastClientContactAt: string;
  /** Days between follow-up contacts (e.g. 7 = weekly) */
  emailReminderDays: number;
  /** When false, follow-up reminders are paused for this project */
  emailReminderEnabled: boolean;
  /** Team member responsible for this project/deal */
  leadUserId?: string;
  comments: ProjectComment[];
  todos: ProjectTodo[];
  contacts: ProjectContact[];
  files: ProjectFile[];
  financials: ProjectFinancials;
  createdAt: string; // ISO
}

/** Common follow-up windows */
export const EMAIL_REMINDER_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;

export const DEFAULT_EMAIL_REMINDER_DAYS = 7;

export function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Anchor date for the reminder clock */
export function lastContactDate(p: Project): string {
  return p.lastClientContactAt || p.createdAt.slice(0, 10);
}

export function nextEmailReminderDate(p: Project): string {
  return addDays(
    lastContactDate(p),
    p.emailReminderDays || DEFAULT_EMAIL_REMINDER_DAYS,
  );
}

/** True when reminders are on and it's time (or overdue) to contact the client */
export function isEmailReminderDue(p: Project): boolean {
  if (p.emailReminderEnabled === false) return false;
  return todayDate() >= nextEmailReminderDate(p);
}

/** Positive = days until due; 0 = due today; negative = days overdue */
export function emailReminderDeltaDays(p: Project): number {
  return daysBetween(todayDate(), nextEmailReminderDate(p));
}
