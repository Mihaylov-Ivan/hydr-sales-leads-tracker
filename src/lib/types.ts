export type Stage =
  | "to-contact"
  | "cold-lead"
  | "hot-lead"
  | "under-development"
  | "commissioned"
  | "cancelled";

/**
 * Always-visible kanban columns.
 * "to-contact" and "cancelled" stay collapsed by default on the board.
 */
export const BOARD_STAGES: Stage[] = [
  "cold-lead",
  "hot-lead",
  "under-development",
  "commissioned",
];

/** Stages selectable when creating a project (excludes cancelled). */
export const CREATE_STAGES: Stage[] = ["to-contact", ...BOARD_STAGES];

/** All valid stages (including collapsed / cancelled). */
export const STAGES: Stage[] = [...CREATE_STAGES, "cancelled"];

export const STAGE_LABELS: Record<Stage, string> = {
  "to-contact": "To Contact",
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
    value === "to-contact" ||
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

export const SERIES: Series[] = ["Z Series", "E Series", "Custom"];

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
  /**
   * When set, this payment is Actual (money received) on this date.
   * Expected `dueDate` is kept for delay detection.
   */
  actualDate?: string;
  label?: string;
  /**
   * Optional link to a project deadline — both share the same date on the timeline.
   * Not used when `isMaintenance` is true (standalone dates only).
   */
  milestoneId?: string;
  /**
   * Maintenance income (service / aftercare). Standalone expected + received
   * dates only — not linkable to the Gantt chart.
   */
  isMaintenance?: boolean;
  createdAt: string; // ISO
}

export function parseIsMaintenanceFlag(
  raw: string | null | undefined,
): boolean {
  const t = (raw ?? "").trim().toLowerCase();
  return (
    t === "1" ||
    t === "true" ||
    t === "yes" ||
    t === "y" ||
    t === "maintenance" ||
    t === "maint"
  );
}

/**
 * Project expense kind.
 * - man-hr: allocated labour (for project margin later — not company cash)
 * - materials: manufacture materials that hit cash
 * - installation: site/install costs that hit cash (see subcategories)
 * - maintenance: maintenance costs that hit cash (see subcategories)
 * - admin: administrative costs that hit cash
 */
export type ProjectExpenseCategory =
  | "man-hr"
  | "materials"
  | "installation"
  | "maintenance"
  | "admin";

export const PROJECT_EXPENSE_CATEGORIES: ProjectExpenseCategory[] = [
  "materials",
  "man-hr",
  "installation",
  "maintenance",
  "admin",
];

export const PROJECT_EXPENSE_CATEGORY_LABELS: Record<
  ProjectExpenseCategory,
  string
> = {
  materials: "Manufacture materials",
  "man-hr": "Man-hrs",
  installation: "Installation",
  maintenance: "Maintenance",
  admin: "Admin",
};

/** Categories that use the Fuel / Tickets / Hotels / … subcategory list */
export type SubcategorizedExpenseCategory = "installation" | "maintenance";

export function categoryHasSubcategories(
  category: ProjectExpenseCategory | undefined,
): category is SubcategorizedExpenseCategory {
  return category === "installation" || category === "maintenance";
}

/**
 * Shared travel/site subcategories plus category-specific parts line.
 * Installation uses installation-equipment; Maintenance uses maintenance-parts.
 */
export type ProjectExpenseSubcategory =
  | "fuel"
  | "tickets"
  | "hotels"
  | "travel-allowance"
  | "installation-equipment"
  | "maintenance-parts";

/** @deprecated Prefer ProjectExpenseSubcategory */
export type InstallationSubcategory = ProjectExpenseSubcategory;

export const INSTALLATION_SUBCATEGORIES: ProjectExpenseSubcategory[] = [
  "fuel",
  "tickets",
  "hotels",
  "travel-allowance",
  "installation-equipment",
];

export const MAINTENANCE_SUBCATEGORIES: ProjectExpenseSubcategory[] = [
  "fuel",
  "tickets",
  "hotels",
  "travel-allowance",
  "maintenance-parts",
];

export const PROJECT_EXPENSE_SUBCATEGORY_LABELS: Record<
  ProjectExpenseSubcategory,
  string
> = {
  fuel: "Fuel",
  tickets: "Tickets",
  hotels: "Hotels",
  "travel-allowance": "Travel Allowance",
  "installation-equipment": "Installation equipment",
  "maintenance-parts": "Maintenance parts",
};

/** @deprecated Prefer PROJECT_EXPENSE_SUBCATEGORY_LABELS */
export const INSTALLATION_SUBCATEGORY_LABELS = PROJECT_EXPENSE_SUBCATEGORY_LABELS;

export function subcategoriesForCategory(
  category: SubcategorizedExpenseCategory,
): ProjectExpenseSubcategory[] {
  return category === "maintenance"
    ? MAINTENANCE_SUBCATEGORIES
    : INSTALLATION_SUBCATEGORIES;
}

export function subcategoryLabel(
  subcategory: ProjectExpenseSubcategory,
): string {
  return PROJECT_EXPENSE_SUBCATEGORY_LABELS[subcategory];
}

/** Categories that leave the company bank account */
export const CASH_EXPENSE_CATEGORIES: ReadonlySet<ProjectExpenseCategory> =
  new Set(["materials", "installation", "maintenance", "admin"]);

export function isProjectExpenseCategory(
  value: unknown,
): value is ProjectExpenseCategory {
  return (
    value === "man-hr" ||
    value === "materials" ||
    value === "installation" ||
    value === "maintenance" ||
    value === "admin"
  );
}

export function isProjectExpenseSubcategory(
  value: unknown,
): value is ProjectExpenseSubcategory {
  return (
    value === "fuel" ||
    value === "tickets" ||
    value === "hotels" ||
    value === "travel-allowance" ||
    value === "installation-equipment" ||
    value === "maintenance-parts"
  );
}

/** @deprecated Prefer isProjectExpenseSubcategory */
export const isInstallationSubcategory = isProjectExpenseSubcategory;

/** Parse category cell from CSV/Excel (ids or display labels). */
export function parseProjectExpenseCategory(
  raw: string | null | undefined,
): ProjectExpenseCategory | undefined {
  const t = (raw ?? "").trim().toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
  if (!t) return undefined;
  if (
    t === "materials" ||
    t === "manufacture materials" ||
    t === "manufacture material" ||
    t === "material"
  ) {
    return "materials";
  }
  if (
    t === "man hr" ||
    t === "man hrs" ||
    t === "manhr" ||
    t === "manhrs" ||
    t === "labour" ||
    t === "labor"
  ) {
    return "man-hr";
  }
  if (t === "installation" || t === "install") return "installation";
  if (t === "maintenance" || t === "maintain") return "maintenance";
  if (t === "admin" || t === "administrative" || t === "administration") {
    return "admin";
  }
  // Combined "installation / fuel" or "maintenance:fuel"
  const slash = t.split(/[/:]/).map((s) => s.trim());
  if (slash[0] === "installation" || slash[0] === "install") {
    return "installation";
  }
  if (slash[0] === "maintenance" || slash[0] === "maintain") {
    return "maintenance";
  }
  if (slash[0] === "admin" || slash[0] === "administrative") {
    return "admin";
  }
  return isProjectExpenseCategory(raw?.trim())
    ? (raw!.trim() as ProjectExpenseCategory)
    : undefined;
}

/** Parse subcategory cell (ids or display labels). */
export function parseProjectExpenseSubcategory(
  raw: string | null | undefined,
): ProjectExpenseSubcategory | undefined {
  const t = (raw ?? "").trim().toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
  if (!t) return undefined;
  if (t === "fuel") return "fuel";
  if (t === "tickets" || t === "ticket") return "tickets";
  if (t === "hotels" || t === "hotel") return "hotels";
  if (
    t === "travel allowance" ||
    t === "travelallowance" ||
    t === "allowance"
  ) {
    return "travel-allowance";
  }
  if (
    t === "maintenance parts" ||
    t === "maintenance part" ||
    t === "maint parts"
  ) {
    return "maintenance-parts";
  }
  if (
    t === "installation equipment" ||
    t === "install equipment" ||
    t === "equipment"
  ) {
    return "installation-equipment";
  }
  return isProjectExpenseSubcategory(raw?.trim())
    ? (raw!.trim() as ProjectExpenseSubcategory)
    : undefined;
}

/** @deprecated Prefer parseProjectExpenseSubcategory */
export const parseInstallationSubcategory = parseProjectExpenseSubcategory;

/** Display label for category (+ subcategory when applicable). */
export function formatExpenseCategoryLabel(
  category: ProjectExpenseCategory,
  subcategory?: ProjectExpenseSubcategory | null,
): string {
  const base = PROJECT_EXPENSE_CATEGORY_LABELS[category];
  if (categoryHasSubcategories(category) && subcategory) {
    return `${base} · ${subcategoryLabel(subcategory)}`;
  }
  return base;
}

/**
 * Base amount for expense % → € conversion.
 * Materials / Man-hr use their project max caps; installation/maintenance/admin fall back to contract value.
 */
export function expensePercentBase(
  category: ProjectExpenseCategory | undefined,
  financials: Pick<
    ProjectFinancials,
    "maxMaterialsExpense" | "maxManHrExpense" | "contractValue"
  >,
): number | undefined {
  const cat = category ?? "materials";
  if (cat === "materials") {
    return financials.maxMaterialsExpense != null &&
      financials.maxMaterialsExpense > 0
      ? financials.maxMaterialsExpense
      : undefined;
  }
  if (cat === "man-hr") {
    return financials.maxManHrExpense != null && financials.maxManHrExpense > 0
      ? financials.maxManHrExpense
      : undefined;
  }
  return financials.contractValue != null && financials.contractValue > 0
    ? financials.contractValue
    : undefined;
}

/** Best-effort category from free-text labels (imports / legacy rows). */
export function inferExpenseCategory(
  label?: string | null,
): ProjectExpenseCategory {
  const t = (label ?? "").trim().toLowerCase();
  if (!t) return "materials";
  if (
    /\bman[\s-]?hrs?\b/.test(t) ||
    /\blabou?r\b/.test(t) ||
    /\bsalary\b/.test(t) ||
    /\bwages?\b/.test(t)
  ) {
    return "man-hr";
  }
  if (/\bmaint/.test(t) || /\bmaintenance\s*parts?\b/.test(t)) {
    return "maintenance";
  }
  if (/\badmin\b/.test(t) || /\badministrative\b/.test(t)) {
    return "admin";
  }
  if (
    /\binstall/.test(t) ||
    /\bfuel\b/.test(t) ||
    /\btickets?\b/.test(t) ||
    /\bhotels?\b/.test(t) ||
    /\btravel\s*allowance\b/.test(t)
  ) {
    return "installation";
  }
  return "materials";
}

export function inferProjectExpenseSubcategory(
  label?: string | null,
  category?: ProjectExpenseCategory,
): ProjectExpenseSubcategory | undefined {
  const t = (label ?? "").trim().toLowerCase();
  if (!t) return undefined;
  if (/\bfuel\b/.test(t)) return "fuel";
  if (/\btickets?\b/.test(t)) return "tickets";
  if (/\bhotels?\b/.test(t)) return "hotels";
  if (/\btravel\s*allowance\b/.test(t) || /\ballowance\b/.test(t)) {
    return "travel-allowance";
  }
  if (/\bmaintenance\s*parts?\b/.test(t)) return "maintenance-parts";
  if (/\binstallation\s*equipment\b/.test(t)) return "installation-equipment";
  if (/\bequipment\b/.test(t) || /\bparts?\b/.test(t)) {
    return category === "maintenance"
      ? "maintenance-parts"
      : "installation-equipment";
  }
  return undefined;
}

/** @deprecated Prefer inferProjectExpenseSubcategory */
export function inferInstallationSubcategory(
  label?: string | null,
): ProjectExpenseSubcategory | undefined {
  return inferProjectExpenseSubcategory(label, "installation");
}

/** A scheduled project cost / outflow */
export interface ProjectExpenseItem {
  id: string;
  /** Amount with VAT — used for cashflow (materials / installation / maintenance / admin) */
  amount: number;
  /** Amount without VAT */
  amountExVat?: number;
  /** Share of contract value / max category, e.g. 40 for 40% */
  percent?: number;
  /** Expected date (yyyy-mm-dd). When linked to a milestone, mirrors that date. */
  dueDate: string;
  /**
   * When set, this expense is Actual (money paid) on this date.
   * Expected `dueDate` is kept for delay detection.
   */
  actualDate?: string;
  label?: string;
  /**
   * man-hr is for project analysis only; materials + installation + maintenance + admin hit cashflow.
   * Missing on legacy rows — treat via `normalizeProjectExpense`.
   */
  category?: ProjectExpenseCategory;
  /** Only when category is installation or maintenance */
  subcategory?: ProjectExpenseSubcategory;
  milestoneId?: string;
  /** Links this expense slice to a warehouse receipt lot (materials cost follows stock). */
  warehouseLotId?: string;
  /**
   * Original predicted envelope (inc VAT) before WH settle / overspend bump.
   * Kept for display when `amount` is later aligned to actual WH draws.
   */
  budgetAmount?: number;
  createdAt: string; // ISO
}

/** Warehouse catalog material kind → expense category (+ subcategory for parts). */
export type WarehouseMaterialKind =
  | "materials"
  | "installation"
  | "maintenance";

export const WAREHOUSE_MATERIAL_KINDS: WarehouseMaterialKind[] = [
  "materials",
  "installation",
  "maintenance",
];

export const WAREHOUSE_MATERIAL_KIND_LABELS: Record<
  WarehouseMaterialKind,
  string
> = {
  materials: "Manufacture materials",
  installation: "Installation materials",
  maintenance: "Maintenance parts",
};

export type WarehouseLocationType =
  | "project"
  | "spare"
  | "buffer"
  | "unallocated";

export interface WarehouseLocation {
  type: WarehouseLocationType;
  /** Required when type is "project" */
  projectId?: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  sku?: string;
  /** e.g. pcs, kg, m */
  unit: string;
  defaultMaterialKind: WarehouseMaterialKind;
  createdAt: string;
}

export interface WarehouseLot {
  id: string;
  itemId: string;
  qtyReceived: number;
  unitCostIncVat: number;
  unitCostExVat: number;
  /** Purchase / receipt date (yyyy-mm-dd) — preserved on expense slices */
  receivedAt: string;
  /** Project where the purchase was originally booked */
  purchaseProjectId: string;
  /** Expense id created or linked at receipt (may later be split across projects) */
  expenseId: string;
  category: ProjectExpenseCategory;
  subcategory?: ProjectExpenseSubcategory;
  supplier?: string;
  notes?: string;
  label?: string;
  createdAt: string;
}

export interface WarehouseBalance {
  id: string;
  lotId: string;
  location: WarehouseLocation;
  qty: number;
}

export type WarehouseMovementAction =
  | "receive"
  | "allocate"
  | "transfer"
  | "consume"
  | "adjust";

export interface WarehouseMovement {
  id: string;
  lotId: string;
  action: WarehouseMovementAction;
  qty: number;
  from?: WarehouseLocation;
  to?: WarehouseLocation;
  occurredAt: string;
  note?: string;
}

export interface WarehouseState {
  items: WarehouseItem[];
  lots: WarehouseLot[];
  balances: WarehouseBalance[];
  movements: WarehouseMovement[];
  holdingProjectId: string | null;
}

export const WAREHOUSE_HOLDING_PROJECT_NAME = "Warehouse / Central stock";

export function emptyWarehouseState(): WarehouseState {
  return {
    items: [],
    lots: [],
    balances: [],
    movements: [],
    holdingProjectId: null,
  };
}

/** Default VAT rate used to convert between ex-VAT and with-VAT amounts. */
export const DEFAULT_VAT_RATE = 0.2;

export function amountIncFromEx(
  exVat: number,
  rate: number = DEFAULT_VAT_RATE,
): number {
  return Math.round(exVat * (1 + rate) * 100) / 100;
}

export function amountExFromInc(
  incVat: number,
  rate: number = DEFAULT_VAT_RATE,
): number {
  if (!(1 + rate)) return incVat;
  return Math.round((incVat / (1 + rate)) * 100) / 100;
}

export function normalizeProjectExpense(
  item: ProjectExpenseItem,
): ProjectExpenseItem {
  const category = isProjectExpenseCategory(item.category)
    ? item.category
    : inferExpenseCategory(item.label);
  const next: ProjectExpenseItem = { ...item, category };
  if (item.warehouseLotId) next.warehouseLotId = item.warehouseLotId;
  if (item.budgetAmount != null && item.budgetAmount > 0) {
    next.budgetAmount = item.budgetAmount;
  }
  if (categoryHasSubcategories(category)) {
    const allowed = new Set(subcategoriesForCategory(category));
    let sub = isProjectExpenseSubcategory(item.subcategory)
      ? item.subcategory
      : undefined;
    // Map parts/equipment across install ↔ maintenance if needed
    if (sub === "installation-equipment" && category === "maintenance") {
      sub = "maintenance-parts";
    } else if (sub === "maintenance-parts" && category === "installation") {
      sub = "installation-equipment";
    }
    if (!sub || !allowed.has(sub)) {
      sub = inferProjectExpenseSubcategory(item.label, category);
    }
    if (sub && allowed.has(sub)) next.subcategory = sub;
    else delete next.subcategory;
  } else {
    delete next.subcategory;
  }
  if (
    (next.amountExVat == null || !Number.isFinite(next.amountExVat)) &&
    next.amount > 0
  ) {
    next.amountExVat = amountExFromInc(next.amount);
  }
  return next;
}

/** Stage → win probability (0–100). Used for weighted pipeline. */
export type StageProbabilities = Partial<Record<Stage, number>>;

export const DEFAULT_STAGE_PROBABILITIES: Record<
  Exclude<Stage, "cancelled" | "to-contact">,
  number
> = {
  "cold-lead": 10,
  "hot-lead": 40,
  "under-development": 100,
  commissioned: 100,
};

/** Company overhead for one calendar month (fixed monthly outgoings). */
export type CompanyMonthlyExpenseStatus = "actual" | "projected";

export interface CompanyMonthlyExpense {
  /** yyyy-mm */
  month: string;
  /** Fixed company monthly cost (payroll + overhead) */
  fixedMonthly: number;
  /**
   * actual = money already spent (past / closed months)
   * projected = planned company spend (current / future)
   */
  status: CompanyMonthlyExpenseStatus;
}

export function companyMonthlyCashTotal(
  entry: Pick<CompanyMonthlyExpense, "fixedMonthly">,
): number {
  return Math.max(0, entry.fixedMonthly || 0);
}

/**
 * Accepts `{ fixedMonthly }` or legacy `{ salary, other }` / `{ amount }` rows.
 */
export function normalizeCompanyMonthlyExpense(
  raw: unknown,
): CompanyMonthlyExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const month = typeof r.month === "string" ? r.month.slice(0, 7) : "";
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const status: CompanyMonthlyExpenseStatus =
    r.status === "actual" ? "actual" : "projected";

  let fixedMonthly =
    typeof r.fixedMonthly === "number" && Number.isFinite(r.fixedMonthly)
      ? r.fixedMonthly
      : 0;

  // Legacy salary + other → combined fixed monthly
  if (fixedMonthly <= 0) {
    const salary =
      typeof r.salary === "number" && Number.isFinite(r.salary) ? r.salary : 0;
    const other =
      typeof r.other === "number" && Number.isFinite(r.other) ? r.other : 0;
    if (salary > 0 || other > 0) {
      fixedMonthly = Math.max(0, salary) + Math.max(0, other);
    }
  }

  // Legacy single-amount opex
  if (
    fixedMonthly <= 0 &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount) &&
    r.amount > 0
  ) {
    fixedMonthly = r.amount;
  }

  if (fixedMonthly < 0) fixedMonthly = 0;
  if (fixedMonthly <= 0) return null;

  return { month, fixedMonthly, status };
}

/** Company-level cash plan settings (singleton) */
export interface CompanyFinanceSettings {
  /**
   * Bank / cash balance at the open of `openingCashAsOf`.
   * All later inflows and outflows come from projects + company opex.
   */
  openingCash: number;
  /**
   * yyyy-mm — month whose opening equals `openingCash`.
   * Independent of which months you choose to view in the table.
   */
  openingCashAsOf?: string;
  minWorkingCapital: number;
  stageProbabilities: StageProbabilities;
  /** Per-month fixed company cost (not project-linked) */
  monthlyExpenses: CompanyMonthlyExpense[];
}

export function defaultFinanceSettings(): CompanyFinanceSettings {
  return {
    openingCash: 0,
    minWorkingCapital: 0,
    stageProbabilities: { ...DEFAULT_STAGE_PROBABILITIES },
    monthlyExpenses: [],
  };
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
  /** Cap used when Materials expense lines are entered as a % */
  maxMaterialsExpense?: number;
  /** Cap used when Man-hr expense lines are entered as a % */
  maxManHrExpense?: number;
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

/** A named span on the project Gantt schedule */
export interface ProjectGanttPhase {
  id: string;
  name: string;
  /** Phase start (yyyy-mm-dd) */
  startDate: string;
  /** Inclusive length in calendar days (≥ 1) */
  durationDays: number;
  /** Actual start when tracking progress (yyyy-mm-dd) */
  actualStartDate?: string;
  /** Actual inclusive duration in calendar days */
  actualDurationDays?: number;
  /** Accent color for the bar (hex). Assigned if omitted. */
  color?: string;
  /** Optional WBS / outline code, e.g. "1.0" */
  wbs?: string;
  /** Responsible party label */
  owner?: string;
  /** Display order (lower first) */
  sortOrder: number;
  createdAt: string; // ISO
}

/** A timed activity (bar) belonging to a phase */
export interface ProjectGanttActivity {
  id: string;
  phaseId: string;
  name: string;
  /** Activity start (yyyy-mm-dd) */
  startDate: string;
  /** Inclusive length in calendar days (≥ 1). Use 1 for a milestone bar. */
  durationDays: number;
  /** Actual start when tracking progress (yyyy-mm-dd) */
  actualStartDate?: string;
  /** Actual inclusive duration in calendar days */
  actualDurationDays?: number;
  /** Optional WBS code, e.g. "2.1" */
  wbs?: string;
  owner?: string;
  /** Accent override (e.g. review/approval in green) */
  color?: string;
  /** Planned / In progress / Done, etc. */
  status?: string;
  sortOrder: number;
  createdAt: string; // ISO
}

/** A point-in-time deadline / milestone belonging to a phase */
export interface ProjectGanttDeadline {
  id: string;
  phaseId: string;
  name: string;
  /** Deadline date (yyyy-mm-dd) — should fall within the phase span */
  date: string;
  /** Actual completion date when tracking progress */
  actualDate?: string;
  /** Optional WBS code, e.g. "1.1" */
  wbs?: string;
  owner?: string;
  note?: string;
  createdAt: string; // ISO
}

export interface ProjectSchedule {
  phases: ProjectGanttPhase[];
  activities: ProjectGanttActivity[];
  deadlines: ProjectGanttDeadline[];
}

export function emptySchedule(): ProjectSchedule {
  return { phases: [], activities: [], deadlines: [] };
}

export const GANTT_PHASE_COLORS = [
  "#009e98",
  "#b4be35",
  "#d99a06",
  "#2f8f4e",
  "#14545c",
  "#c45c26",
  "#3d7ea6",
  "#8a6d3b",
] as const;

const TODO_KIND_ORDER: Record<TodoKind, number> = {
  question: 0,
  "our-action": 1,
  "client-action": 2,
};

/** Closest deadline first; undated last; kind as secondary priority */
export function compareTodosByDeadline(a: ProjectTodo, b: ProjectTodo): number {
  const aDate = a.dueDate ?? "9999-12-31";
  const bDate = b.dueDate ?? "9999-12-31";
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  const byKind = TODO_KIND_ORDER[a.kind] - TODO_KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  return a.createdAt.localeCompare(b.createdAt);
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
  /**
   * Internal holding project for spare/buffer stock expenses.
   * Hidden from the sales Board; visible in Warehouse / Expenses pickers.
   */
  isWarehouseHolding?: boolean;
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
  /**
   * Pipeline metrics timestamps (yyyy-mm-dd). Commissioned also implies
   * under-development was reached even if underDevelopmentAt was never set.
   */
  coldLeadEnteredAt: string;
  hotLeadEnteredAt?: string;
  underDevelopmentAt?: string;
  commissionedAt?: string;
  cancelledAt?: string;
  /** Last substantive client activity (not auto-reminders). yyyy-mm-dd */
  lastMeaningfulActivityAt: string;
  cancellationReason?: string;
  comments: ProjectComment[];
  todos: ProjectTodo[];
  contacts: ProjectContact[];
  files: ProjectFile[];
  financials: ProjectFinancials;
  /** Project delivery schedule: phases + deadlines within them */
  schedule: ProjectSchedule;
  createdAt: string; // ISO
}

/** Company-level pipeline metrics thresholds (DB singleton + local fallback). */
export interface CompanyMetricsSettings {
  staleColdDays: number;
  staleHotDays: number;
  staleUnderDevelopmentDays: number;
  maturityUnderDevelopmentMonths: number;
  maturityCommissionedMonths: number;
  /** 0–1 probability that healthy active projects convert (expected scenario) */
  healthyConversionProbability: number;
  /** 0–1 probability that stale projects recover and convert */
  staleRecoveryProbability: number;
}

export function defaultMetricsSettings(): CompanyMetricsSettings {
  return {
    staleColdDays: 180,
    staleHotDays: 120,
    staleUnderDevelopmentDays: 90,
    maturityUnderDevelopmentMonths: 12,
    maturityCommissionedMonths: 30,
    healthyConversionProbability: 0.35,
    staleRecoveryProbability: 0.1,
  };
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

/** Shift a calendar date by whole months, clamping day-of-month (e.g. Jan 31 → Feb 28). */
export function addCalendarMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T12:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(day, lastDay));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export type ScheduleShiftUnit = "days" | "weeks" | "months";

/** Fixed day count for days/weeks; for months uses a sample date via addCalendarMonths. */
export function scheduleShiftDeltaDays(
  amount: number,
  unit: ScheduleShiftUnit,
  sampleDate = "2024-01-15",
): number {
  if (unit === "days") return amount;
  if (unit === "weeks") return amount * 7;
  return daysBetween(sampleDate, addCalendarMonths(sampleDate, amount));
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive end date for a phase (start + duration − 1 day) */
export function phaseEndDate(phase: ProjectGanttPhase): string {
  return addDays(phase.startDate, Math.max(1, phase.durationDays) - 1);
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

/** Domains for append-only app change / process history */
export type ChangeEventDomain =
  | "crm"
  | "gantt"
  | "finance_meta"
  | "warehouse"
  | "system";

export const CHANGE_EVENT_DOMAINS: ChangeEventDomain[] = [
  "crm",
  "gantt",
  "finance_meta",
  "warehouse",
  "system",
];

/**
 * Non-financial (or finance metadata-only) change event.
 * `payloadJson` must never contain monetary amounts.
 */
export interface ChangeEvent {
  id: string;
  occurredAt: string;
  actorUserId?: string;
  actorName?: string;
  intentional: boolean;
  domain: ChangeEventDomain;
  entityType: string;
  entityId?: string;
  projectId?: string;
  action: string;
  field?: string;
  summary: string;
  payloadJson?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Financial before/after snapshot (localStorage + CSV only).
 * Linked to `ChangeEvent` via `eventId` === `ChangeEvent.id`.
 */
export interface FinancialHistoryEntry {
  eventId: string;
  occurredAt: string;
  intentional: boolean;
  actorUserId?: string;
  actorName?: string;
  projectId?: string;
  projectName?: string;
  entityType: string;
  entityId?: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  summary: string;
}
