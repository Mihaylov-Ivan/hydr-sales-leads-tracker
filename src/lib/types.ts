export type Stage = "new-lead" | "under-development" | "commissioned";

export const STAGES: Stage[] = ["new-lead", "under-development", "commissioned"];

export const STAGE_LABELS: Record<Stage, string> = {
  "new-lead": "New Lead",
  "under-development": "Under Development",
  commissioned: "Commissioned",
};

export type Series = "Z Series" | "E Series" | "Custom";

export type Market =
  | "Cement"
  | "Power Plants"
  | "Funding"
  | "Clean H2"
  | "Burner Optimisation";

export const MARKETS: Market[] = [
  "Cement",
  "Power Plants",
  "Funding",
  "Clean H2",
  "Burner Optimisation",
];

export interface ProjectComment {
  id: string;
  text: string;
  author: string;
  createdAt: string; // ISO
  /** Present when the comment also moved the project to a new stage */
  stageChange?: Stage;
}

export type TodoKind = "question" | "our-action" | "client-action";

export const TODO_KINDS: TodoKind[] = ["question", "our-action", "client-action"];

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
  /** Share of overall project expenses, e.g. 40 for 40% */
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
  /** Days between follow-up emails (e.g. 7 = weekly) */
  emailReminderDays: number;
  comments: ProjectComment[];
  todos: ProjectTodo[];
  contacts: ProjectContact[];
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
  return addDays(lastContactDate(p), p.emailReminderDays || DEFAULT_EMAIL_REMINDER_DAYS);
}

/** True when it's time (or overdue) to email the client */
export function isEmailReminderDue(p: Project): boolean {
  return todayDate() >= nextEmailReminderDate(p);
}

/** Positive = days until due; 0 = due today; negative = days overdue */
export function emailReminderDeltaDays(p: Project): number {
  return daysBetween(todayDate(), nextEmailReminderDate(p));
}
