"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MilestoneKind,
  Project,
  ProjectComment,
  ProjectContact,
  ProjectExpenseCategory,
  ProjectExpenseItem,
  InstallationSubcategory,
  ProjectFile,
  ProjectFileKind,
  ProjectFinancials,
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectMilestone,
  ProjectPayment,
  ProjectSchedule,
  ProjectTodo,
  Stage,
  TeamMember,
  TodoKind,
  CompanyFinanceSettings,
  CompanyMetricsSettings,
  ChangeEvent,
  FinancialHistoryEntry,
  WarehouseItem,
  WarehouseGroup,
  WarehouseLocation,
  WarehouseLot,
  WarehouseMaterialKind,
  WarehouseMovement,
  WarehouseBalance,
  WarehouseBomSaveInput,
  WarehouseState,
  WAREHOUSE_HOLDING_PROJECT_NAME,
  STAGE_LABELS,
  TEAM_MEMBERS,
  DEFAULT_EMAIL_REMINDER_DAYS,
  GANTT_PHASE_COLORS,
  emptyFinancials,
  emptySchedule,
  emptyWarehouseState,
  defaultFinanceSettings,
  defaultMetricsSettings,
  categoryHasSubcategories,
  amountExFromInc,
  normalizeCompanyMonthlyExpense,
  normalizeProjectExpense,
  normalizeStage,
  todayDate,
  addDays,
  phaseEndDate,
  ScheduleShiftUnit,
} from "./types";
import { SEED_PROJECTS } from "./seed";
import {
  buildChangeEvent,
  buildFinancialHistoryEntry,
  changeEventFromRow,
  changeEventToRow,
  createEventId,
  formatValue,
  mergeFinancialHistory,
  sortChangeEventsDesc,
  summarizeCrmProjectPatch,
  summarizeFinancialFieldChange,
  changeEventsFromStageHistory,
  type ChangeEventRow,
  type RecordChangeInput,
} from "./change-history";
import {
  supabase,
  commentFromRow,
  contactFromRow,
  fileFromRow,
  ganttActivityFromRow,
  ganttDeadlineFromRow,
  ganttPhaseFromRow,
  metricsSettingsFromRow,
  metricsSettingsToRow,
  projectFromRow,
  teamMemberFromRow,
  teamMemberToRow,
  todoFromRow,
} from "./supabase";
import type {
  CommentRow,
  ContactRow,
  FileRow,
  GanttActivityRow,
  GanttDeadlineRow,
  GanttPhaseRow,
  MetricsSettingsRow,
  ProjectRow,
  TeamMemberRow,
  TodoRow,
} from "./supabase";
import {
  FinanceImportData,
  sanitizeAppFinancials,
  settingsAfterImport,
} from "./finance-import";
import { METRICS_SETTINGS_STORAGE_KEY } from "./metrics/config";
import {
  ensureProjectMetricsDefaults,
  initialMetricsFields,
  stageChangeTimestampPatch,
} from "./metrics/project-bridge";
import {
  ensureScheduleShape,
  isMunichBusFleetProject,
  isScheduleEmpty,
  munichBusFleetSchedule,
} from "./gantt-munich";
import { resolveLinkedDeadlineDate } from "./gantt-finance";
import {
  shiftProjectFinancials,
  shiftProjectSchedule as applyScheduleShift,
  type ScheduleShiftOpts,
} from "./schedule-shift";
import {
  applyFinancialCsvBundle,
  applyWarehouseLotCsvRows,
  parseFinancialCsv,
} from "./financial-csv";
import {
  loadRemoteWarehouseState,
  mergeLocalWarehouseFallback,
  persistRemoteWarehouseState,
  persistRemoteSkladMaps,
} from "./warehouse-db";
import {
  applySkladMapsToWarehouseState,
  buildDefaultSkladMaps,
  SYSTEM_SKLAD_PROJECT_SEEDS,
  type WarehouseSkladMap,
} from "./warehouse-sklad-map";
import { linkProjectSlotLotsToMaterialsExpenses } from "./warehouse-expense-link";
import { buildSavedBom, mergeBomsAfterImport } from "./warehouse-bom";
import {
  expenseProjectIdForLocation,
  findBalance,
  applyBalanceDelta,
  cloneLocation,
  isBudgetEnvelopeExpense,
  loadWarehouseState,
  locationLabel,
  locationsEqual,
  materialKindToExpense,
  movementSummary,
  preserveBudgetAmount,
  roundMoney,
  saveWarehouseState,
  spentAgainstExpense,
  spentAgainstExpenseEx,
  unitCostExFromInc,
} from "./warehouse";

const STORAGE_KEY = "hydrogenera-lead-tracker-v1";
const TEAM_STORAGE_KEY = "hydrogenera-team-members-v1";
const TEAM_MIGRATED_KEY = "hydrogenera-team-members-migrated-v1";
const CURRENT_USER_STORAGE_KEY = "hydrogenera-current-user-v1";
const FINANCE_SETTINGS_STORAGE_KEY = "hydrogenera-finance-settings-v1";
const FINANCE_IMPORT_STORAGE_KEY = "hydrogenera-finance-import-v1";
const PROJECT_FINANCIALS_STORAGE_KEY = "hydrogenera-project-financials-v1";
const PROJECT_SCHEDULE_STORAGE_KEY = "hydrogenera-project-schedule-v2";
const PROJECT_SCHEDULE_STORAGE_KEY_LEGACY = "hydrogenera-project-schedule-v1";
const CHANGE_EVENTS_STORAGE_KEY = "hydrogenera-change-events-v1";
const FINANCIAL_HISTORY_STORAGE_KEY = "hydrogenera-financial-history-v1";
const MEANINGFUL_CHANGE_STORAGE_KEY = "hydrogenera-meaningful-change-v1";
const STAGE_HISTORY_BACKFILL_KEY = "hydrogenera-stage-history-backfill-v1";
const FILE_STORAGE_BUCKET = "project-files";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function loadLocalChangeEvents(): ChangeEvent[] {
  try {
    const raw = window.localStorage.getItem(CHANGE_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChangeEvent[];
    return Array.isArray(parsed) ? sortChangeEventsDesc(parsed) : [];
  } catch {
    return [];
  }
}

function loadLocalFinancialHistory(): FinancialHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(FINANCIAL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FinancialHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLocalMeaningfulChangeMode(): boolean {
  try {
    return window.localStorage.getItem(MEANINGFUL_CHANGE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

async function loadRemoteChangeEvents(): Promise<ChangeEvent[]> {
  if (!supabase) return loadLocalChangeEvents();
  const { data, error } = await supabase
    .from("app_change_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (error || !data) {
    if (error) console.error("Failed to load change events:", error.message);
    return loadLocalChangeEvents();
  }
  const events: ChangeEvent[] = [];
  for (const row of data as ChangeEventRow[]) {
    const ev = changeEventFromRow(row);
    if (ev) events.push(ev);
  }
  return sortChangeEventsDesc(events);
}

function loadLocalProjectSchedules(): Record<string, ProjectSchedule> {
  try {
    // Drop the pre-demo schedule blob (manual test entries).
    window.localStorage.removeItem(PROJECT_SCHEDULE_STORAGE_KEY_LEGACY);
    const raw = window.localStorage.getItem(PROJECT_SCHEDULE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProjectSchedule>;
    if (!parsed || typeof parsed !== "object") return {};
    const cleaned: Record<string, ProjectSchedule> = {};
    for (const [id, s] of Object.entries(parsed)) {
      cleaned[id] = ensureScheduleShape(s);
    }
    return cleaned;
  } catch {
    return {};
  }
}

function withLocalSchedule(projects: Project[]): Project[] {
  const local = loadLocalProjectSchedules();
  return projects.map((p) => {
    // Munich demo: after clearing the old schedule blob, prefer a saved v2
    // schedule; otherwise install the full Initiation → Engineering → Procurement chart.
    if (isMunichBusFleetProject(p)) {
      const saved = local[p.id];
      return {
        ...p,
        schedule: !isScheduleEmpty(saved)
          ? ensureScheduleShape(saved)
          : munichBusFleetSchedule(),
      };
    }

    const remote = ensureScheduleShape(p.schedule);
    const hasRemote =
      remote.phases.length > 0 ||
      remote.activities.length > 0 ||
      remote.deadlines.length > 0;
    const schedule = hasRemote
      ? remote
      : ensureScheduleShape(local[p.id] ?? remote);

    return { ...p, schedule };
  });
}

function loadLocalProjectFinancials(): Record<string, ProjectFinancials> {
  try {
    const raw = window.localStorage.getItem(PROJECT_FINANCIALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProjectFinancials>;
    if (!parsed || typeof parsed !== "object") return {};
    const cleaned: Record<string, ProjectFinancials> = {};
    for (const [id, f] of Object.entries(parsed)) {
      cleaned[id] = sanitizeAppFinancials(f);
    }
    return cleaned;
  } catch {
    return {};
  }
}

function withLocalFinancials(projects: Project[]): Project[] {
  const local = loadLocalProjectFinancials();
  return projects.map((p) =>
    ensureProjectMetricsDefaults({
      ...p,
      financials: sanitizeAppFinancials(
        local[p.id] ?? p.financials ?? emptyFinancials(),
      ),
    }),
  );
}

function loadLocalMetricsSettings(): CompanyMetricsSettings {
  try {
    const raw = window.localStorage.getItem(METRICS_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultMetricsSettings();
    const parsed = JSON.parse(raw) as Partial<CompanyMetricsSettings>;
    const base = defaultMetricsSettings();
    return {
      staleColdDays:
        typeof parsed.staleColdDays === "number" && parsed.staleColdDays > 0
          ? parsed.staleColdDays
          : base.staleColdDays,
      staleHotDays:
        typeof parsed.staleHotDays === "number" && parsed.staleHotDays > 0
          ? parsed.staleHotDays
          : base.staleHotDays,
      staleUnderDevelopmentDays:
        typeof parsed.staleUnderDevelopmentDays === "number" &&
          parsed.staleUnderDevelopmentDays > 0
          ? parsed.staleUnderDevelopmentDays
          : base.staleUnderDevelopmentDays,
      maturityUnderDevelopmentMonths:
        typeof parsed.maturityUnderDevelopmentMonths === "number" &&
          parsed.maturityUnderDevelopmentMonths > 0
          ? parsed.maturityUnderDevelopmentMonths
          : base.maturityUnderDevelopmentMonths,
      maturityCommissionedMonths:
        typeof parsed.maturityCommissionedMonths === "number" &&
          parsed.maturityCommissionedMonths > 0
          ? parsed.maturityCommissionedMonths
          : base.maturityCommissionedMonths,
      healthyConversionProbability:
        typeof parsed.healthyConversionProbability === "number"
          ? Math.min(1, Math.max(0, parsed.healthyConversionProbability))
          : base.healthyConversionProbability,
      staleRecoveryProbability:
        typeof parsed.staleRecoveryProbability === "number"
          ? Math.min(1, Math.max(0, parsed.staleRecoveryProbability))
          : base.staleRecoveryProbability,
    };
  } catch {
    return defaultMetricsSettings();
  }
}

async function loadRemoteMetricsSettings(): Promise<CompanyMetricsSettings> {
  if (!supabase) return loadLocalMetricsSettings();
  const { data, error } = await supabase
    .from("company_metrics_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return loadLocalMetricsSettings();
  return metricsSettingsFromRow(data as MetricsSettingsRow);
}

export interface NewProjectInput {
  name: string;
  client: string;
  country: string;
  city: string;
  series: Project["series"];
  market: Project["market"];
  sizeKw: number;
  stage: Stage;
  baseDescription: string;
  leadUserId?: string;
  lastMeaningfulActivityAt?: string;
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    | "name"
    | "client"
    | "country"
    | "city"
    | "series"
    | "market"
    | "sizeKw"
    | "stage"
    | "baseDescription"
    | "lastClientContactAt"
    | "emailReminderDays"
    | "emailReminderEnabled"
    | "leadUserId"
    | "coldLeadEnteredAt"
    | "hotLeadEnteredAt"
    | "underDevelopmentAt"
    | "commissionedAt"
    | "cancelledAt"
    | "lastMeaningfulActivityAt"
    | "cancellationReason"
  >
>;

export type MetricsSettingsPatch = Partial<CompanyMetricsSettings>;

/** `null` clears the field, `undefined` leaves it unchanged. */
export interface TodoPatch {
  text?: string;
  answer?: string | null;
  dueDate?: string | null;
  ownerUserId?: string | null;
}

/** All fields optional; empty strings are treated as "not provided". */
export interface ContactInput {
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
}

/** `null` clears the field, `undefined` leaves it unchanged. */
export interface FinancialsPatch {
  contractValue?: number | null;
  contractSignedDate?: string | null;
  expenses?: number | null;
  expectedProfit?: number | null;
  maxMaterialsExpense?: number | null;
  maxManHrExpense?: number | null;
}

export interface PaymentInput {
  amount: number;
  /** Pass `null` to clear an existing percent */
  percent?: number | null;
  dueDate: string;
  label?: string;
  /** Tie this payment to a project deadline (date follows the milestone) */
  milestoneId?: string;
  /** Pass `null` to clear actualization; omit to leave unchanged on update */
  actualDate?: string | null;
  /** Maintenance income — standalone dates only (no Gantt link) */
  isMaintenance?: boolean | null;
}

/** Dated project outflow; category drives cash vs margin-only handling */
export interface ExpenseInput extends PaymentInput {
  category: ProjectExpenseCategory;
  /** Installation/maintenance subcategory; ignored for other categories */
  subcategory?: InstallationSubcategory | null;
  /** Amount without VAT; pass `null` to clear on update */
  amountExVat?: number | null;
  /** Link to warehouse lot; pass `null` to clear on update */
  warehouseLotId?: string | null;
}

export interface WarehouseReceiveInput {
  itemId?: string;
  newItem?: {
    name: string;
    sku?: string;
    unit?: string;
    defaultMaterialKind?: WarehouseMaterialKind;
    /** Product group (type taxonomy leaf/root) */
    groupId?: string;
  };
  /** When receiving against an existing catalog item, optionally set/clear its group */
  groupId?: string | null;
  qty: number;
  unitCostIncVat: number;
  unitCostExVat?: number | null;
  receivedAt: string;
  materialKind: WarehouseMaterialKind;
  destination: WarehouseLocation;
  expenseMode: "create" | "link";
  linkExpense?: { projectId: string; expenseId: string };
  label?: string;
  supplier?: string;
  notes?: string;
  actualDate?: string;
}

export interface WarehouseTransferInput {
  lotId: string;
  qty: number;
  from: WarehouseLocation;
  to: WarehouseLocation;
  note?: string;
}

export interface WarehouseConsumeInput {
  lotId: string;
  qty: number;
  from: WarehouseLocation;
  note?: string;
}

export interface WarehouseAdjustInput {
  lotId: string;
  location: WarehouseLocation;
  newQty: number;
  note?: string;
}

export interface WarehouseLotUpdateInput {
  lotId: string;
  receivedAt?: string;
  unitCostIncVat?: number;
  unitCostExVat?: number | null;
  label?: string | null;
  supplier?: string | null;
  notes?: string | null;
  materialKind?: WarehouseMaterialKind;
  purchaseProjectId?: string;
  /** Link lot to an expense envelope; `null` clears. */
  expenseId?: string | null;
  /** Reassign catalog item for this lot. */
  itemId?: string;
}

export interface FinanceSettingsPatch {
  openingCash?: number;
  openingCashAsOf?: string | null;
  minWorkingCapital?: number;
  stageProbabilities?: CompanyFinanceSettings["stageProbabilities"];
  monthlyExpenses?: CompanyFinanceSettings["monthlyExpenses"];
}

export interface MilestoneInput {
  kind: MilestoneKind;
  date: string;
  note?: string;
}

export interface GanttPhaseInput {
  name: string;
  startDate: string;
  durationDays: number;
  actualStartDate?: string | null;
  actualDurationDays?: number | null;
  color?: string;
  wbs?: string;
  owner?: string;
  sortOrder?: number;
}

export interface GanttActivityInput {
  phaseId: string;
  name: string;
  startDate: string;
  durationDays: number;
  actualStartDate?: string | null;
  actualDurationDays?: number | null;
  wbs?: string;
  owner?: string;
  color?: string;
  status?: string;
  sortOrder?: number;
}

export interface GanttDeadlineInput {
  phaseId: string;
  name: string;
  date: string;
  actualDate?: string | null;
  wbs?: string;
  owner?: string;
  note?: string;
}

interface ProjectsApi {
  teamMembers: TeamMember[];
  addTeamMember: (input: { name: string; email?: string }) => void;
  updateTeamMember: (
    memberId: string,
    patch: { name?: string; email?: string | null },
  ) => void;
  /** Currently selected app user (for authorship of updates) */
  currentUserId: string | null;
  setCurrentUserId: (userId: string | null) => void;
  /**
   * When true, recorded changes are tagged intentional (real process change).
   * Default false = typo / data-entry correction.
   */
  meaningfulChangeMode: boolean;
  setMeaningfulChangeMode: (on: boolean) => void;
  /** Non-financial + finance_meta change events (DB when available) */
  changeEvents: ChangeEvent[];
  /** Financial before/after snapshots (localStorage + CSV only) */
  financialHistory: FinancialHistoryEntry[];
  /** Company opening cash, min WC, stage win probabilities (local only) */
  financeSettings: CompanyFinanceSettings;
  updateFinanceSettings: (patch: FinanceSettingsPatch) => void;
  /** Pipeline metrics thresholds (DB when available, else localStorage) */
  metricsSettings: CompanyMetricsSettings;
  updateMetricsSettings: (patch: MetricsSettingsPatch) => void;
  /** CSV/Excel actuals import — source of past company + project cash */
  financeImport: FinanceImportData | null;
  applyFinanceImport: (data: FinanceImportData) => void;
  clearFinanceImport: () => void;
  /**
   * Replace project financials + company finance settings from the
   * portable financial CSV (Header download / import).
   */
  importFinancialCsvText: (
    text: string,
  ) =>
    | { ok: true; matched: number; historyRows: number }
    | { ok: false; error: string };
  projects: Project[];
  ready: boolean;
  /** True when the server has an AI API key configured */
  aiEnabled: boolean;
  /** Project ids with an AI summary generation currently in flight */
  summarizing: Record<string, boolean>;
  addProject: (input: NewProjectInput) => string;
  addComment: (projectId: string, text: string, stageChange?: Stage) => void;
  updateProject: (projectId: string, patch: ProjectPatch) => void;
  /** Mark client as contacted today — restarts the follow-up window */
  markClientContacted: (projectId: string) => void;
  updateComment: (projectId: string, commentId: string, text: string) => void;
  deleteComment: (projectId: string, commentId: string) => void;
  regenerateSummary: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  addTodo: (
    projectId: string,
    kind: TodoKind,
    text: string,
    dueDate?: string,
    ownerUserId?: string,
  ) => void;
  toggleTodo: (projectId: string, todoId: string) => void;
  updateTodo: (projectId: string, todoId: string, patch: TodoPatch) => void;
  deleteTodo: (projectId: string, todoId: string) => void;
  addContact: (projectId: string, input: ContactInput) => void;
  updateContact: (projectId: string, contactId: string, patch: ContactInput) => void;
  deleteContact: (projectId: string, contactId: string) => void;
  addProjectFile: (
    projectId: string,
    file: File,
    kind: ProjectFileKind,
    note?: string,
  ) => Promise<{ ok: true; file: ProjectFile } | { ok: false; error: string }>;
  updateProjectFile: (
    projectId: string,
    fileId: string,
    patch: { kind?: ProjectFileKind; note?: string | null },
  ) => void;
  deleteProjectFile: (projectId: string, fileId: string) => Promise<void>;
  getProjectFileUrl: (file: ProjectFile) => Promise<string | null>;
  updateFinancials: (projectId: string, patch: FinancialsPatch) => void;
  addPayment: (projectId: string, input: PaymentInput) => void;
  updatePayment: (projectId: string, paymentId: string, patch: PaymentInput) => void;
  deletePayment: (projectId: string, paymentId: string) => void;
  addExpense: (projectId: string, input: ExpenseInput) => void;
  updateExpense: (projectId: string, expenseId: string, patch: ExpenseInput) => void;
  deleteExpense: (
    projectId: string,
    expenseId: string,
  ) => { ok: true } | { ok: false; error: string };
  warehouse: WarehouseState;
  ensureWarehouseHoldingProject: () => string;
  receiveStock: (
    input: WarehouseReceiveInput,
  ) => { ok: true; lotId: string } | { ok: false; error: string };
  transferStock: (
    input: WarehouseTransferInput,
  ) => { ok: true } | { ok: false; error: string };
  consumeStock: (
    input: WarehouseConsumeInput,
  ) => { ok: true } | { ok: false; error: string };
  adjustStock: (
    input: WarehouseAdjustInput,
  ) => { ok: true } | { ok: false; error: string };
  updateWarehouseLot: (
    input: WarehouseLotUpdateInput,
  ) => { ok: true } | { ok: false; error: string };
  deleteWarehouseLot: (
    lotId: string,
  ) => { ok: true } | { ok: false; error: string };
  upsertWarehouseItem: (input: {
    id?: string;
    name: string;
    sku?: string;
    unit?: string;
    defaultMaterialKind?: WarehouseMaterialKind;
    /** Pass string to set, `null` to clear, omit to leave unchanged */
    groupId?: string | null;
  }) => string;
  /** Create or rename a catalog group (type taxonomy). */
  upsertWarehouseGroup: (input: {
    id?: string;
    name: string;
    /** Pass string to set parent, `null` to clear, omit to leave unchanged on update */
    parentId?: string | null;
  }) => { ok: true; id: string } | { ok: false; error: string };
  /** Remove a catalog group; clears item links and promotes child groups. */
  deleteWarehouseGroup: (
    groupId: string,
  ) => { ok: true } | { ok: false; error: string };
  /** Replace inventory from MoneyWorks CSV import (keeps holdingProjectId). */
  importMoneyWorksWarehouse: () => Promise<
    | {
        ok: true;
        stats: {
          groups: number;
          items: number;
          lots: number;
          balances: number;
          serials: number;
          boms: number;
          bomLines: number;
          parkedSystem: number;
        };
      }
    | { ok: false; error: string }
  >;
  /** Ensure System-* projects exist, then remap parked WH stock to project slots. */
  applySystemSkladMapping: () => Promise<
    | {
        ok: true;
        createdProjects: string[];
        movedBalances: number;
        movedSerials: number;
        maps: number;
        unmatched: string[];
        linkedLots: number;
        createdExpenses: string[];
      }
    | { ok: false; error: string }
  >;
  /** Link project-slot WH lots to each project's first manufacture-materials expense. */
  linkProjectWarehouseExpenses: () =>
    | {
        ok: true;
        linkedLots: number;
        createdExpenses: string[];
        projectCount: number;
      }
    | { ok: false; error: string };
  saveWarehouseBom: (
    input: WarehouseBomSaveInput,
  ) => { ok: true; bomId: string } | { ok: false; error: string };
  duplicateWarehouseBom: (
    bomId: string,
  ) => { ok: true; bomId: string } | { ok: false; error: string };
  deleteWarehouseBom: (
    bomId: string,
  ) => { ok: true } | { ok: false; error: string };
  addMilestone: (projectId: string, input: MilestoneInput) => void;
  updateMilestone: (
    projectId: string,
    milestoneId: string,
    patch: MilestoneInput,
  ) => void;
  deleteMilestone: (projectId: string, milestoneId: string) => void;
  addGanttPhase: (projectId: string, input: GanttPhaseInput) => void;
  updateGanttPhase: (
    projectId: string,
    phaseId: string,
    patch: GanttPhaseInput,
  ) => void;
  deleteGanttPhase: (projectId: string, phaseId: string) => void;
  addGanttActivity: (projectId: string, input: GanttActivityInput) => void;
  updateGanttActivity: (
    projectId: string,
    activityId: string,
    patch: GanttActivityInput,
  ) => void;
  deleteGanttActivity: (projectId: string, activityId: string) => void;
  addGanttDeadline: (projectId: string, input: GanttDeadlineInput) => void;
  updateGanttDeadline: (
    projectId: string,
    deadlineId: string,
    patch: GanttDeadlineInput,
  ) => void;
  deleteGanttDeadline: (projectId: string, deadlineId: string) => void;
  shiftProjectSchedule: (
    projectId: string,
    opts: {
      amount: number;
      unit: ScheduleShiftUnit;
      includeActuals?: boolean;
    },
  ) => void;
}

const ProjectsContext = createContext<ProjectsApi | null>(null);

function loadLocal(): Project[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Project[];
      // Data saved before newer features may lack these fields
      return parsed.map((p) => ({
        ...p,
        stage: normalizeStage(p.stage),
        market: p.market ?? "Clean H2",
        ...(p.isWarehouseHolding ? { isWarehouseHolding: true as const } : {}),
        lastClientContactAt:
          p.lastClientContactAt ?? p.createdAt.slice(0, 10),
        emailReminderDays: p.emailReminderDays ?? DEFAULT_EMAIL_REMINDER_DAYS,
        emailReminderEnabled: p.emailReminderEnabled !== false,
        ...(p.leadUserId ? { leadUserId: p.leadUserId } : {}),
        todos: (p.todos ?? []).map((t) => ({ ...t, kind: t.kind ?? "our-action" })),
        contacts: p.contacts ?? [],
        files: (p.files ?? []).map((f) => ({
          ...f,
          kind: f.kind ?? "other",
          mimeType: f.mimeType || "application/octet-stream",
          sizeBytes: f.sizeBytes ?? 0,
        })),
        comments: (p.comments ?? []).map((c) => ({
          ...c,
          ...(c.stageChange
            ? { stageChange: normalizeStage(c.stageChange) }
            : {}),
        })),
        financials: {
          ...emptyFinancials(),
          ...p.financials,
          payments: p.financials?.payments ?? [],
          expenseSchedule: (p.financials?.expenseSchedule ?? []).map((e) =>
            normalizeProjectExpense(e),
          ),
          milestones: p.financials?.milestones ?? [],
        },
        schedule: ensureScheduleShape(p.schedule),
      }));
    }
  } catch {
    // corrupted storage: fall back to seed data
  }
  return SEED_PROJECTS;
}

function loadLocalTeamMembers(): TeamMember[] {
  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return TEAM_MEMBERS;
    const parsed = JSON.parse(raw) as TeamMember[];
    const sanitized = parsed
      .map((m) => ({
        id: m.id,
        name: m.name?.trim() ?? "",
        ...(m.email?.trim() ? { email: m.email.trim() } : {}),
      }))
      .filter((m) => m.id && m.name);
    return sanitized.length > 0 ? sanitized : TEAM_MEMBERS;
  } catch {
    return TEAM_MEMBERS;
  }
}

function sanitizeTeamMembers(rows: TeamMember[]): TeamMember[] {
  return rows
    .map((m) => ({
      id: m.id,
      name: m.name?.trim() ?? "",
      ...(m.email?.trim() ? { email: m.email.trim() } : {}),
    }))
    .filter((m) => m.id && m.name);
}

/**
 * Load team members from Supabase. If the table is empty (or missing),
 * seed once from browser localStorage so existing name edits are not lost.
 */
async function loadRemoteTeamMembers(): Promise<TeamMember[]> {
  const res = await supabase!
    .from("team_members")
    .select("*")
    .order("name", { ascending: true });

  if (res.error) {
    console.error("Supabase team members load failed:", res.error.message);
    return loadLocalTeamMembers();
  }

  const remote = sanitizeTeamMembers(
    ((res.data ?? []) as TeamMemberRow[]).map(teamMemberFromRow),
  );

  let migrated = false;
  let hadLocalStore = false;
  try {
    migrated = window.localStorage.getItem(TEAM_MIGRATED_KEY) === "1";
    hadLocalStore = window.localStorage.getItem(TEAM_STORAGE_KEY) != null;
  } catch {
    // ignore
  }

  if (!migrated) {
    const local = loadLocalTeamMembers();
    const byId = new Map<string, TeamMember>();
    for (const m of remote) byId.set(m.id, m);

    if (remote.length === 0) {
      for (const m of local) byId.set(m.id, m);
    } else if (hadLocalStore) {
      // This browser had edited the roster before DB sync — push those
      // names up once, then treat Supabase as the source of truth.
      for (const m of local) byId.set(m.id, m);
    } else {
      for (const m of local) {
        if (!byId.has(m.id)) byId.set(m.id, m);
      }
    }

    const merged = sanitizeTeamMembers([...byId.values()]);
    if (merged.length > 0) {
      const { error } = await supabase!
        .from("team_members")
        .upsert(merged.map(teamMemberToRow), { onConflict: "id" });
      if (error) {
        console.error("Supabase team members seed failed:", error.message);
      } else {
        try {
          window.localStorage.setItem(TEAM_MIGRATED_KEY, "1");
        } catch {
          // ignore
        }
        return merged.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  if (remote.length > 0) return remote;
  return loadLocalTeamMembers();
}

function loadLocalCurrentUserId(members: TeamMember[]): string | null {
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (!raw) return members[0]?.id ?? null;
    const id = JSON.parse(raw) as string | null;
    if (!id) return null;
    return members.some((m) => m.id === id) ? id : (members[0]?.id ?? null);
  } catch {
    return members[0]?.id ?? null;
  }
}

function loadLocalFinanceSettings(): CompanyFinanceSettings {
  try {
    const raw = window.localStorage.getItem(FINANCE_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultFinanceSettings();
    const parsed = JSON.parse(raw) as Partial<CompanyFinanceSettings>;
    const base = defaultFinanceSettings();
    return {
      openingCash:
        typeof parsed.openingCash === "number"
          ? parsed.openingCash
          : base.openingCash,
      minWorkingCapital:
        typeof parsed.minWorkingCapital === "number"
          ? parsed.minWorkingCapital
          : base.minWorkingCapital,
      stageProbabilities: {
        ...base.stageProbabilities,
        ...(parsed.stageProbabilities ?? {}),
      },
      monthlyExpenses: Array.isArray(parsed.monthlyExpenses)
        ? parsed.monthlyExpenses
            .map(normalizeCompanyMonthlyExpense)
            .filter((e): e is NonNullable<typeof e> => e != null)
        : base.monthlyExpenses,
      ...(typeof parsed.openingCashAsOf === "string"
        ? { openingCashAsOf: parsed.openingCashAsOf.slice(0, 7) }
        : {}),
    };
  } catch {
    return defaultFinanceSettings();
  }
}

function loadLocalFinanceImport(): FinanceImportData | null {
  try {
    const raw = window.localStorage.getItem(FINANCE_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceImportData;
    if (!parsed || !Array.isArray(parsed.projectActuals)) {
      return null;
    }
    return {
      ...parsed,
      companyMonths: Array.isArray(parsed.companyMonths)
        ? parsed.companyMonths
        : [],
      projectExpected: Array.isArray(parsed.projectExpected)
        ? parsed.projectExpected
        : [],
      projectMilestones: Array.isArray(parsed.projectMilestones)
        ? parsed.projectMilestones
        : [],
      ...(Array.isArray(parsed.companyMonthlyExpenses)
        ? { companyMonthlyExpenses: parsed.companyMonthlyExpenses }
        : {}),
      ...(Array.isArray(parsed.projectCaps)
        ? { projectCaps: parsed.projectCaps }
        : {}),
    };
  } catch {
    return null;
  }
}

async function loadRemote(): Promise<Project[]> {
  const [
    projectsRes,
    commentsRes,
    todosRes,
    contactsRes,
    filesRes,
    phasesRes,
    activitiesRes,
    deadlinesRes,
  ] = await Promise.all([
    supabase!
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase!
      .from("project_comments")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase!
      .from("project_todos")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase!
      .from("project_contacts")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase!
      .from("project_files")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase!
      .from("project_gantt_phases")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase!
      .from("project_gantt_activities")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase!
      .from("project_gantt_deadlines")
      .select("*")
      .order("date", { ascending: true }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (todosRes.error) throw todosRes.error;
  if (contactsRes.error) {
    console.error("Supabase contacts load failed:", contactsRes.error.message);
  }
  if (filesRes.error) {
    console.error("Supabase files load failed:", filesRes.error.message);
  }
  if (phasesRes.error) {
    console.error("Supabase gantt phases load failed:", phasesRes.error.message);
  }
  if (activitiesRes.error) {
    console.error(
      "Supabase gantt activities load failed:",
      activitiesRes.error.message,
    );
  }
  if (deadlinesRes.error) {
    console.error(
      "Supabase gantt deadlines load failed:",
      deadlinesRes.error.message,
    );
  }

  const commentsByProject = new Map<string, ProjectComment[]>();
  for (const row of (commentsRes.data ?? []) as CommentRow[]) {
    const list = commentsByProject.get(row.project_id) ?? [];
    list.push(commentFromRow(row));
    commentsByProject.set(row.project_id, list);
  }
  const todosByProject = new Map<string, ProjectTodo[]>();
  for (const row of (todosRes.data ?? []) as TodoRow[]) {
    const list = todosByProject.get(row.project_id) ?? [];
    list.push(todoFromRow(row));
    todosByProject.set(row.project_id, list);
  }
  const contactsByProject = new Map<string, ProjectContact[]>();
  for (const row of (contactsRes.data ?? []) as ContactRow[]) {
    const list = contactsByProject.get(row.project_id) ?? [];
    list.push(contactFromRow(row));
    contactsByProject.set(row.project_id, list);
  }
  const filesByProject = new Map<string, ProjectFile[]>();
  for (const row of (filesRes.data ?? []) as FileRow[]) {
    const list = filesByProject.get(row.project_id) ?? [];
    list.push(fileFromRow(row));
    filesByProject.set(row.project_id, list);
  }
  const phasesByProject = new Map<string, ProjectGanttPhase[]>();
  for (const row of (phasesRes.data ?? []) as GanttPhaseRow[]) {
    const list = phasesByProject.get(row.project_id) ?? [];
    list.push(ganttPhaseFromRow(row));
    phasesByProject.set(row.project_id, list);
  }
  const activitiesByProject = new Map<string, ProjectGanttActivity[]>();
  for (const row of (activitiesRes.data ?? []) as GanttActivityRow[]) {
    const list = activitiesByProject.get(row.project_id) ?? [];
    list.push(ganttActivityFromRow(row));
    activitiesByProject.set(row.project_id, list);
  }
  const deadlinesByProject = new Map<string, ProjectGanttDeadline[]>();
  for (const row of (deadlinesRes.data ?? []) as GanttDeadlineRow[]) {
    const list = deadlinesByProject.get(row.project_id) ?? [];
    list.push(ganttDeadlineFromRow(row));
    deadlinesByProject.set(row.project_id, list);
  }
  // Financial schedules are local / Excel only — never loaded from DB.
  return ((projectsRes.data ?? []) as ProjectRow[]).map((row) =>
    projectFromRow(
      row,
      commentsByProject.get(row.id) ?? [],
      todosByProject.get(row.id) ?? [],
      contactsByProject.get(row.id) ?? [],
      emptyFinancials(),
      filesByProject.get(row.id) ?? [],
      {
        phases: phasesByProject.get(row.id) ?? [],
        activities: activitiesByProject.get(row.id) ?? [],
        deadlines: deadlinesByProject.get(row.id) ?? [],
      },
    ),
  );
}

function logDbError(action: string) {
  return ({ error }: { error: { message: string } | null }) => {
    if (error) console.error(`Supabase ${action} failed:`, error.message);
  };
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(TEAM_MEMBERS);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [meaningfulChangeMode, setMeaningfulChangeModeState] = useState(false);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [financialHistory, setFinancialHistory] = useState<
    FinancialHistoryEntry[]
  >([]);
  const [financeSettings, setFinanceSettings] = useState<CompanyFinanceSettings>(
    defaultFinanceSettings,
  );
  const [metricsSettings, setMetricsSettings] = useState<CompanyMetricsSettings>(
    defaultMetricsSettings,
  );
  const [financeImport, setFinanceImport] = useState<FinanceImportData | null>(
    null,
  );
  const [warehouse, setWarehouse] = useState<WarehouseState>(emptyWarehouseState);
  const [ready, setReady] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [supportsOwnershipFields, setSupportsOwnershipFields] = useState(false);
  const [supportsCommentAuthorId, setSupportsCommentAuthorId] = useState(false);
  const [supportsMetricsFields, setSupportsMetricsFields] = useState(false);
  const [supportsMetricsSettingsTable, setSupportsMetricsSettingsTable] =
    useState(false);
  const [supportsGanttTables, setSupportsGanttTables] = useState(false);
  const [supportsWarehouseHolding, setSupportsWarehouseHolding] = useState(false);
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const teamMembersRef = useRef<TeamMember[]>(teamMembers);
  teamMembersRef.current = teamMembers;
  const currentUserIdRef = useRef<string | null>(currentUserId);
  currentUserIdRef.current = currentUserId;
  const meaningfulChangeModeRef = useRef(meaningfulChangeMode);
  meaningfulChangeModeRef.current = meaningfulChangeMode;
  const changeEventsRef = useRef<ChangeEvent[]>(changeEvents);
  changeEventsRef.current = changeEvents;
  const financialHistoryRef = useRef<FinancialHistoryEntry[]>(financialHistory);
  financialHistoryRef.current = financialHistory;
  const warehouseRef = useRef<WarehouseState>(warehouse);
  warehouseRef.current = warehouse;
  const deleteWarehouseLotRef = useRef<
    (lotId: string) => { ok: true } | { ok: false; error: string }
  >(() => ({ ok: false, error: "Warehouse not ready" }));

  function tagHoldingProjects(
    list: Project[],
    holdingId: string | null,
  ): Project[] {
    if (!holdingId) {
      return list.map((p) =>
        p.isWarehouseHolding ? { ...p, isWarehouseHolding: true } : p,
      );
    }
    return list.map((p) =>
      p.id === holdingId || p.isWarehouseHolding
        ? { ...p, isWarehouseHolding: true }
        : p,
    );
  }

  useEffect(() => {
    async function boot() {
      const wh = loadWarehouseState();
      setWarehouse(wh);
      if (supabase) {
        const [members, remoteProjects, remoteMetrics] = await Promise.all([
          loadRemoteTeamMembers().catch((e) => {
            console.error("Failed to load team members from Supabase:", e);
            return loadLocalTeamMembers();
          }),
          loadRemote().catch((e) => {
            console.error("Failed to load projects from Supabase:", e);
            return [] as Project[];
          }),
          loadRemoteMetricsSettings().catch(() => loadLocalMetricsSettings()),
        ]);
        setTeamMembers(members);
        setCurrentUserIdState(loadLocalCurrentUserId(members));
        setProjects(
          tagHoldingProjects(
            withLocalSchedule(withLocalFinancials(remoteProjects)),
            wh.holdingProjectId,
          ),
        );
        setFinanceSettings(loadLocalFinanceSettings());
        setMetricsSettings(remoteMetrics);
        setFinanceImport(loadLocalFinanceImport());
        setMeaningfulChangeModeState(loadLocalMeaningfulChangeMode());
        setFinancialHistory(loadLocalFinancialHistory());
        let remoteEvents = await loadRemoteChangeEvents().catch(() =>
          loadLocalChangeEvents(),
        );

        // One-shot backfill from project_stage_history → app_change_events
        try {
          const already =
            window.localStorage.getItem(STAGE_HISTORY_BACKFILL_KEY) === "1";
          if (!already && supabase) {
            const { data: stageRows, error: stageErr } = await supabase
              .from("project_stage_history")
              .select("id, project_id, stage, entered_at")
              .order("entered_at", { ascending: true });
            if (!stageErr && stageRows && stageRows.length > 0) {
              const names = new Map(
                remoteProjects.map((p) => [p.id, p.name] as const),
              );
              const existingIds = new Set(remoteEvents.map((e) => e.id));
              const backfilled = changeEventsFromStageHistory(
                stageRows as {
                  id: string;
                  project_id: string;
                  stage: string;
                  entered_at: string;
                }[],
                names,
              ).filter((e) => !existingIds.has(e.id));
              if (backfilled.length > 0) {
                remoteEvents = sortChangeEventsDesc([
                  ...backfilled,
                  ...remoteEvents,
                ]);
                // Insert missing rows into app_change_events (ignore duplicates)
                for (const ev of backfilled) {
                  void supabase
                    .from("app_change_events")
                    .upsert(changeEventToRow(ev), { onConflict: "id" })
                    .then(logDbError("stage history backfill"));
                }
              }
            }
            window.localStorage.setItem(STAGE_HISTORY_BACKFILL_KEY, "1");
          }
        } catch (e) {
          console.error("Stage history backfill failed:", e);
        }

        setChangeEvents(remoteEvents);

        const remoteWh = await loadRemoteWarehouseState(
          wh.holdingProjectId,
        ).catch(() => null);
        const mergedWh = mergeLocalWarehouseFallback(remoteWh, wh);
        setWarehouse(mergedWh);
        // Seed remote from local cache when DB tables are empty
        if (
          supabase &&
          remoteWh &&
          remoteWh.lots.length === 0 &&
          remoteWh.items.length === 0 &&
          (mergedWh.lots.length > 0 || mergedWh.items.length > 0)
        ) {
          void persistRemoteWarehouseState(mergedWh).then((res) => {
            if (!res.ok) console.error("Warehouse seed failed:", res.error);
          });
        }

        setReady(true);
      } else {
        const members = loadLocalTeamMembers();
        setTeamMembers(members);
        setCurrentUserIdState(loadLocalCurrentUserId(members));
        setProjects(
          tagHoldingProjects(
            withLocalSchedule(withLocalFinancials(loadLocal())),
            wh.holdingProjectId,
          ),
        );
        setFinanceSettings(loadLocalFinanceSettings());
        setMetricsSettings(loadLocalMetricsSettings());
        setFinanceImport(loadLocalFinanceImport());
        setMeaningfulChangeModeState(loadLocalMeaningfulChangeMode());
        setFinancialHistory(loadLocalFinancialHistory());
        setChangeEvents(loadLocalChangeEvents());
        setReady(true);
      }
    }

    void boot();

    fetch("/api/summarize")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => setAiEnabled(false));
    if (supabase) {
      Promise.all([
        supabase.from("projects").select("lead_user_id").limit(1),
        supabase.from("project_todos").select("owner_user_id").limit(1),
        supabase.from("project_comments").select("author_user_id").limit(1),
        supabase.from("projects").select("last_meaningful_activity_at").limit(1),
        supabase.from("company_metrics_settings").select("id").limit(1),
        supabase.from("project_gantt_phases").select("id").limit(1),
        supabase.from("projects").select("is_warehouse_holding").limit(1),
      ])
        .then(
          ([
            projectsCols,
            todosCols,
            commentsCols,
            metricsCols,
            settingsTable,
            ganttTable,
            warehouseHoldingCol,
          ]) => {
            setSupportsOwnershipFields(
              !projectsCols.error && !todosCols.error,
            );
            setSupportsCommentAuthorId(!commentsCols.error);
            setSupportsMetricsFields(!metricsCols.error);
            setSupportsMetricsSettingsTable(!settingsTable.error);
            setSupportsGanttTables(!ganttTable.error);
            setSupportsWarehouseHolding(!warehouseHoldingCol.error);
          },
        )
        .catch(() => {
          setSupportsOwnershipFields(false);
          setSupportsCommentAuthorId(false);
          setSupportsMetricsFields(false);
          setSupportsMetricsSettingsTable(false);
          setSupportsGanttTables(false);
          setSupportsWarehouseHolding(false);
        });
    }
  }, []);

  // Without a database the tracker keeps persisting to localStorage.
  useEffect(() => {
    if (ready && !supabase) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
  }, [projects, ready]);

  useEffect(() => {
    if (ready && !supabase) {
      window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teamMembers));
    }
  }, [teamMembers, ready]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(
        FINANCE_SETTINGS_STORAGE_KEY,
        JSON.stringify(financeSettings),
      );
    }
  }, [financeSettings, ready]);

  // App-entered project financials (CSV portable “financial DB”).
  useEffect(() => {
    if (!ready) return;
    const map: Record<string, ProjectFinancials> = {};
    for (const p of projects) {
      map[p.id] = sanitizeAppFinancials(p.financials);
    }
    window.localStorage.setItem(
      PROJECT_FINANCIALS_STORAGE_KEY,
      JSON.stringify(map),
    );
  }, [projects, ready]);

  // Gantt schedules — always mirrored locally (and synced to DB when available).
  useEffect(() => {
    if (!ready) return;
    const map: Record<string, ProjectSchedule> = {};
    for (const p of projects) {
      map[p.id] = p.schedule ?? emptySchedule();
    }
    window.localStorage.setItem(
      PROJECT_SCHEDULE_STORAGE_KEY,
      JSON.stringify(map),
    );
  }, [projects, ready]);

  useEffect(() => {
    if (!ready) return;
    if (financeImport) {
      window.localStorage.setItem(
        FINANCE_IMPORT_STORAGE_KEY,
        JSON.stringify(financeImport),
      );
    } else {
      window.localStorage.removeItem(FINANCE_IMPORT_STORAGE_KEY);
    }
  }, [financeImport, ready]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(
        CURRENT_USER_STORAGE_KEY,
        JSON.stringify(currentUserId),
      );
    }
  }, [currentUserId, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(
      MEANINGFUL_CHANGE_STORAGE_KEY,
      meaningfulChangeMode ? "1" : "0",
    );
  }, [meaningfulChangeMode, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(
      CHANGE_EVENTS_STORAGE_KEY,
      JSON.stringify(changeEvents.slice(0, 2000)),
    );
  }, [changeEvents, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(
      FINANCIAL_HISTORY_STORAGE_KEY,
      JSON.stringify(financialHistory),
    );
  }, [financialHistory, ready]);

  useEffect(() => {
    if (!ready) return;
    saveWarehouseState(warehouse);
    if (!supabase) return;
    const t = window.setTimeout(() => {
      void persistRemoteWarehouseState(warehouse).then((res) => {
        if (!res.ok) console.error("Warehouse persist failed:", res.error);
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [warehouse, ready]);

  // If the selected user is removed/edited away, fall back to first member.
  useEffect(() => {
    if (!ready) return;
    if (
      currentUserId &&
      !teamMembers.some((m) => m.id === currentUserId)
    ) {
      setCurrentUserIdState(teamMembers[0]?.id ?? null);
    }
  }, [teamMembers, currentUserId, ready]);

  const setCurrentUserId = useCallback((userId: string | null) => {
    setCurrentUserIdState(userId);
  }, []);

  const setMeaningfulChangeMode = useCallback((on: boolean) => {
    setMeaningfulChangeModeState(on);
  }, []);

  type RecordFinanceSnapshot = {
    projectId?: string;
    projectName?: string;
    entityType: string;
    entityId?: string;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    summary: string;
  };

  /** Resolves when a newly created project row is confirmed in Supabase (or immediately if offline). */
  const projectInsertWaitersRef = useRef(
    new Map<string, Promise<boolean>>(),
  );

  const persistChangeEventRemote = useCallback((event: ChangeEvent) => {
    const client = supabase;
    if (!client) return;
    const row = changeEventToRow(event);
    void client
      .from("app_change_events")
      .insert(row)
      .then(async ({ error }) => {
        // Project create races: event can arrive before projects row. Retry without FK.
        if (
          error &&
          row.project_id &&
          /app_change_events_project_id_fkey/i.test(error.message)
        ) {
          const { project_id: _drop, ...rest } = row;
          void client
            .from("app_change_events")
            .insert({ ...rest, project_id: null })
            .then(logDbError("change event insert (no project_id)"));
          return;
        }
        logDbError("change event insert")({ error });
      });
  }, []);

  const recordChangeEvent = useCallback(
    (
      input: Omit<RecordChangeInput, "intentional" | "actorUserId" | "actorName"> & {
        intentional?: boolean;
      },
      financeSnapshot?: RecordFinanceSnapshot,
      options?: { skipRemote?: boolean },
    ): ChangeEvent => {
      const authorInfo = (() => {
        const id = currentUserIdRef.current;
        const member = id
          ? teamMembersRef.current.find((m) => m.id === id)
          : undefined;
        return {
          actorName: member?.name ?? "You",
          ...(member ? { actorUserId: member.id } : {}),
        };
      })();
      const event = buildChangeEvent({
        ...input,
        intentional:
          input.intentional ?? meaningfulChangeModeRef.current,
        ...authorInfo,
      });
      setChangeEvents((prev) => sortChangeEventsDesc([event, ...prev]));
      if (supabase && !options?.skipRemote) {
        persistChangeEventRemote(event);
      }
      if (financeSnapshot) {
        const hist = buildFinancialHistoryEntry({
          eventId: event.id,
          occurredAt: event.occurredAt,
          intentional: event.intentional,
          ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
          ...(event.actorName ? { actorName: event.actorName } : {}),
          ...financeSnapshot,
        });
        setFinancialHistory((prev) => mergeFinancialHistory(prev, [hist]));
      }
      return event;
    },
    [persistChangeEventRemote],
  );

  const updateFinanceSettings = useCallback(
    (patch: FinanceSettingsPatch) => {
      setFinanceSettings((current) => {
        const next: CompanyFinanceSettings = {
          openingCash:
            patch.openingCash !== undefined
              ? patch.openingCash
              : current.openingCash,
          minWorkingCapital:
            patch.minWorkingCapital !== undefined
              ? patch.minWorkingCapital
              : current.minWorkingCapital,
          stageProbabilities: {
            ...current.stageProbabilities,
            ...(patch.stageProbabilities ?? {}),
          },
          monthlyExpenses:
            patch.monthlyExpenses !== undefined
              ? patch.monthlyExpenses
                  .map(normalizeCompanyMonthlyExpense)
                  .filter((e): e is NonNullable<typeof e> => e != null)
              : current.monthlyExpenses,
        };
        if (patch.openingCashAsOf !== undefined) {
          if (patch.openingCashAsOf) next.openingCashAsOf = patch.openingCashAsOf;
        } else if (current.openingCashAsOf) {
          next.openingCashAsOf = current.openingCashAsOf;
        }

        const moneyFields: {
          field: string;
          oldValue: string;
          newValue: string;
        }[] = [];
        if (
          patch.openingCash !== undefined &&
          patch.openingCash !== current.openingCash
        ) {
          moneyFields.push({
            field: "opening_cash",
            oldValue: formatValue(current.openingCash),
            newValue: formatValue(patch.openingCash),
          });
        }
        if (
          patch.minWorkingCapital !== undefined &&
          patch.minWorkingCapital !== current.minWorkingCapital
        ) {
          moneyFields.push({
            field: "min_working_capital",
            oldValue: formatValue(current.minWorkingCapital),
            newValue: formatValue(patch.minWorkingCapital),
          });
        }
        if (
          patch.openingCashAsOf !== undefined &&
          (patch.openingCashAsOf ?? "") !== (current.openingCashAsOf ?? "")
        ) {
          moneyFields.push({
            field: "opening_cash_as_of",
            oldValue: current.openingCashAsOf ?? "",
            newValue: patch.openingCashAsOf ?? "",
          });
        }
        if (patch.monthlyExpenses !== undefined) {
          moneyFields.push({
            field: "monthly_expenses",
            oldValue: String(current.monthlyExpenses?.length ?? 0),
            newValue: String(next.monthlyExpenses.length),
          });
        }
        if (patch.stageProbabilities) {
          for (const [k, v] of Object.entries(patch.stageProbabilities)) {
            const oldV =
              current.stageProbabilities[
                k as keyof typeof current.stageProbabilities
              ];
            if (v !== undefined && v !== oldV) {
              moneyFields.push({
                field: `prob_${k}`,
                oldValue: formatValue(oldV),
                newValue: formatValue(v),
              });
            }
          }
        }

        if (moneyFields.length > 0) {
          queueMicrotask(() => {
            for (const mf of moneyFields) {
              const summary = summarizeFinancialFieldChange(
                "Company",
                mf.field,
                mf.oldValue,
                mf.newValue,
              );
              recordChangeEvent(
                {
                  id: createEventId(),
                  domain: "finance_meta",
                  entityType: "company_finance",
                  entityId: "company",
                  action: "update",
                  field: mf.field,
                  summary,
                  payloadJson: { field: mf.field },
                },
                {
                  entityType: "company_finance",
                  entityId: "company",
                  action: "update",
                  field: mf.field,
                  oldValue: mf.oldValue,
                  newValue: mf.newValue,
                  summary,
                },
              );
            }
          });
        }

        return next;
      });
    },
    [recordChangeEvent],
  );

  const updateMetricsSettings = useCallback(
    (patch: MetricsSettingsPatch) => {
      setMetricsSettings((prev) => {
        const next: CompanyMetricsSettings = {
          ...prev,
          ...patch,
        };
        const changed = Object.keys(patch).filter(
          (k) =>
            patch[k as keyof MetricsSettingsPatch] !==
            prev[k as keyof CompanyMetricsSettings],
        );
        if (changed.length > 0) {
          queueMicrotask(() => {
            recordChangeEvent({
              domain: "system",
              entityType: "metrics_settings",
              entityId: "company",
              action: "update",
              summary: `Updated metrics settings (${changed.join(", ")})`,
              payloadJson: { fields: changed },
            });
          });
        }
        try {
          window.localStorage.setItem(
            METRICS_SETTINGS_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {
          /* ignore */
        }
        if (supabase && supportsMetricsSettingsTable) {
          void supabase
            .from("company_metrics_settings")
            .upsert({
              ...metricsSettingsToRow(next),
              updated_at: new Date().toISOString(),
            })
            .then(logDbError("metrics settings upsert"));
        }
        return next;
      });
    },
    [supportsMetricsSettingsTable, recordChangeEvent],
  );

  const applyFinanceImport = useCallback(
    (data: FinanceImportData) => {
      setFinanceImport(data);
      setFinanceSettings((prev) => settingsAfterImport(prev, data));
      // Drop local payment/expense schedules while Excel is the source of truth.
      // Keep contract summary fields; apply max expense caps from Projects sheet.
      const capsByName = new Map(
        (data.projectCaps ?? []).map((c) => [
          c.projectName.trim().toLowerCase(),
          c,
        ]),
      );
      setProjects((prev) =>
        prev.map((p) => {
          const f = sanitizeAppFinancials(p.financials);
          const caps = capsByName.get(p.name.trim().toLowerCase());
          const next = {
            ...f,
            payments: [],
            expenseSchedule: [],
          };
          if (caps) {
            if (
              caps.maxMaterialsExpense != null &&
              caps.maxMaterialsExpense > 0
            ) {
              next.maxMaterialsExpense = caps.maxMaterialsExpense;
            }
            if (caps.maxManHrExpense != null && caps.maxManHrExpense > 0) {
              next.maxManHrExpense = caps.maxManHrExpense;
            }
          }
          return {
            ...p,
            financials: next,
          };
        }),
      );
      const summary = `Applied Excel finance import (${data.projectCaps?.length ?? 0} project caps)`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "finance_import",
          entityId: "excel",
          action: "import",
          summary,
          payloadJson: { projectCaps: data.projectCaps?.length ?? 0 },
        },
        {
          entityType: "finance_import",
          entityId: "excel",
          action: "import",
          summary,
        },
      );
    },
    [recordChangeEvent],
  );

  const clearFinanceImport = useCallback(() => {
    setFinanceImport(null);
    setFinanceSettings((prev) => ({
      ...prev,
      monthlyExpenses: (prev.monthlyExpenses ?? []).filter(
        (e) => e.status === "projected",
      ),
    }));
    recordChangeEvent({
      domain: "finance_meta",
      entityType: "finance_import",
      entityId: "excel",
      action: "clear",
      summary: "Cleared Excel finance import overlay",
    });
  }, [recordChangeEvent]);

  const importFinancialCsvText = useCallback(
    (text: string) => {
      const parsed = parseFinancialCsv(text);
      if (!parsed.ok) return parsed;

      const { data } = parsed;
      let matched = 0;
      for (const p of projectsRef.current) {
        if (
          data.byProjectId[p.id] ||
          data.byProjectName[p.name.toLowerCase()]
        ) {
          matched += 1;
        }
      }

      setProjects((prev) => applyFinancialCsvBundle(prev, data));
      if (data.financeSettings) {
        setFinanceSettings(data.financeSettings);
      }
      if (data.history.length > 0) {
        setFinancialHistory((prev) =>
          mergeFinancialHistory(prev, data.history),
        );
      }
      if (data.warehouseLots.length > 0) {
        setWarehouse((prev) => applyWarehouseLotCsvRows(prev, data.warehouseLots));
      }
      if (data.warehouseSkladMaps.length > 0) {
        const maps: WarehouseSkladMap[] = data.warehouseSkladMaps
          .map((m) => {
            const byId = projectsRef.current.find((p) => p.id === m.projectId);
            const byName = m.projectName
              ? projectsRef.current.find(
                  (p) =>
                    p.name.toLowerCase() === m.projectName!.toLowerCase(),
                )
              : undefined;
            const projectId = byId?.id ?? byName?.id;
            if (!projectId) return null;
            return {
              id: m.id || crypto.randomUUID(),
              sourceSklad: m.sourceSklad,
              projectId,
              site: m.site,
              slot: m.slot,
              createdAt: new Date().toISOString(),
            } satisfies WarehouseSkladMap;
          })
          .filter((m): m is WarehouseSkladMap => m != null);
        if (maps.length > 0) {
          setWarehouse((prev) => {
            const result = applySkladMapsToWarehouseState(prev, maps);
            return result.state;
          });
          void persistRemoteSkladMaps(maps);
        }
      }
      const summary = `Imported financial CSV (${matched} project${matched === 1 ? "" : "s"} matched, ${data.history.length} history row${data.history.length === 1 ? "" : "s"}, ${data.warehouseLots.length} warehouse lot${data.warehouseLots.length === 1 ? "" : "s"}, ${data.warehouseSkladMaps.length} sklad map${data.warehouseSkladMaps.length === 1 ? "" : "s"})`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "financial_csv",
          entityId: "import",
          action: "import",
          summary,
          payloadJson: {
            matched,
            historyRows: data.history.length,
          },
        },
        {
          entityType: "financial_csv",
          entityId: "import",
          action: "import",
          summary,
          newValue: String(matched),
        },
      );
      return { ok: true as const, matched, historyRows: data.history.length };
    },
    [recordChangeEvent],
  );

  const resolveAuthor = useCallback(() => {
    const id = currentUserIdRef.current;
    const member = id
      ? teamMembersRef.current.find((m) => m.id === id)
      : undefined;
    return {
      author: member?.name ?? "You",
      ...(member ? { authorUserId: member.id } : {}),
    };
  }, []);

  const addTeamMember = useCallback(
    (input: { name: string; email?: string }) => {
      const name = input.name.trim();
      const email = input.email?.trim();
      if (!name) return;
      const member: TeamMember = {
        id: crypto.randomUUID(),
        name,
        ...(email ? { email } : {}),
      };
      setTeamMembers((prev) =>
        [...prev, member].sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (supabase) {
        void supabase
          .from("team_members")
          .upsert(teamMemberToRow(member), { onConflict: "id" })
          .then(logDbError("team member insert"));
      }
    },
    [],
  );

  const updateTeamMember = useCallback(
    (memberId: string, patch: { name?: string; email?: string | null }) => {
      const current = teamMembersRef.current.find((m) => m.id === memberId);
      if (!current) return;

      const next: TeamMember = { ...current };
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        // Keep non-empty trimmed names; allow brief untrimmed input while typing
        if (trimmed) next.name = trimmed;
        else if (patch.name.length > 0) next.name = patch.name;
      }
      if (patch.email !== undefined) {
        if (patch.email === null || !patch.email.trim()) delete next.email;
        else next.email = patch.email.trim();
      }

      teamMembersRef.current = teamMembersRef.current.map((m) =>
        m.id === memberId ? next : m,
      );
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === memberId ? next : m)),
      );

      if (supabase) {
        void supabase
          .from("team_members")
          .upsert(teamMemberToRow(next), { onConflict: "id" })
          .then(logDbError("team member update"));
      }
    },
    [],
  );

  const requestAiSummary = useCallback(async (project: Project) => {
    setSummarizing((s) => ({ ...s, [project.id]: true }));
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (res.ok) {
        const { summary } = (await res.json()) as { summary?: string };
        if (summary) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id ? { ...p, aiSummary: summary } : p,
            ),
          );
          if (supabase) {
            void supabase
              .from("projects")
              .update({ ai_summary: summary })
              .eq("id", project.id)
              .then(logDbError("summary update"));
          }
        }
      }
    } catch {
      // network/AI failure: the rule-based summary remains as fallback
    } finally {
      setSummarizing((s) => ({ ...s, [project.id]: false }));
    }
  }, []);

  const addProject = useCallback((input: NewProjectInput): string => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const description = input.baseDescription.trim();
    const authorInfo = resolveAuthor();
    // The summary entered at creation doubles as the first update in the timeline.
    const initialComment: ProjectComment | null = description
      ? {
        id: crypto.randomUUID(),
        text: description,
        author: authorInfo.author,
        ...(authorInfo.authorUserId
          ? { authorUserId: authorInfo.authorUserId }
          : {}),
        createdAt,
      }
      : null;
    const project: Project = {
      ...input,
      id,
      lastClientContactAt: createdAt.slice(0, 10),
      emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
      emailReminderEnabled: true,
      ...(input.leadUserId ? { leadUserId: input.leadUserId } : {}),
      ...initialMetricsFields({
        stage: input.stage,
        createdDate: createdAt.slice(0, 10),
        lastMeaningfulActivityAt: input.lastMeaningfulActivityAt,
      }),
      comments: initialComment ? [initialComment] : [],
      todos: [],
      contacts: [],
      files: [],
      financials: emptyFinancials(),
      schedule: emptySchedule(),
      createdAt,
    };
    setProjects((prev) => [project, ...prev]);
    // Keep change event local until projects row exists (FK on app_change_events).
    const event = recordChangeEvent(
      {
        domain: "crm",
        entityType: "project",
        entityId: id,
        projectId: id,
        action: "create",
        summary: `Created project ${project.name}`,
        payloadJson: {
          name: project.name,
          stage: project.stage,
          market: project.market,
        },
      },
      undefined,
      { skipRemote: Boolean(supabase) },
    );
    if (supabase) {
      // Insert comment / history only after the project row exists (FK constraint).
      const insertPromise = supabase
        .from("projects")
        .insert({
          id: project.id,
          name: project.name,
          client: project.client,
          country: project.country,
          city: project.city,
          series: project.series,
          market: project.market,
          size_kw: project.sizeKw,
          stage: project.stage,
          base_description: project.baseDescription,
          ai_summary: project.aiSummary ?? null,
          last_client_contact_at: project.lastClientContactAt,
          email_reminder_days: project.emailReminderDays,
          email_reminder_enabled: project.emailReminderEnabled,
          ...(supportsOwnershipFields
            ? { lead_user_id: project.leadUserId ?? null }
            : {}),
          created_at: project.createdAt,
          ...(supportsMetricsFields
            ? {
              cold_lead_entered_at: project.coldLeadEnteredAt,
              hot_lead_entered_at: project.hotLeadEnteredAt ?? null,
              under_development_at: project.underDevelopmentAt ?? null,
              commissioned_at: project.commissionedAt ?? null,
              cancelled_at: project.cancelledAt ?? null,
              last_meaningful_activity_at: project.lastMeaningfulActivityAt,
            }
            : {}),
        })
        .then((res) => {
          logDbError("project insert")(res);
          if (res.error) return false;
          if (initialComment) {
            void supabase!
              .from("project_comments")
              .insert({
                id: initialComment.id,
                project_id: id,
                text: initialComment.text,
                author: initialComment.author,
                ...(supportsCommentAuthorId
                  ? { author_user_id: initialComment.authorUserId ?? null }
                  : {}),
                stage_change: null,
                created_at: initialComment.createdAt,
              })
              .then(logDbError("initial comment insert"));
          }
          if (supportsMetricsFields) {
            void supabase!
              .from("project_stage_history")
              .insert({
                project_id: id,
                stage: project.stage,
                entered_at: project.coldLeadEnteredAt,
              })
              .then(logDbError("stage history insert"));
          }
          persistChangeEventRemote(event);
          return true;
        });
      projectInsertWaitersRef.current.set(id, Promise.resolve(insertPromise));
    } else {
      projectInsertWaitersRef.current.set(id, Promise.resolve(true));
    }
    return id;
  }, [
    supportsOwnershipFields,
    supportsCommentAuthorId,
    supportsMetricsFields,
    resolveAuthor,
    recordChangeEvent,
    persistChangeEventRemote,
  ]);

  const addComment = useCallback(
    (projectId: string, text: string, stageChange?: Stage) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const authorInfo = resolveAuthor();
      const comment: ProjectComment = {
        id: crypto.randomUUID(),
        text,
        author: authorInfo.author,
        ...(authorInfo.authorUserId
          ? { authorUserId: authorInfo.authorUserId }
          : {}),
        createdAt: new Date().toISOString(),
        ...(stageChange ? { stageChange } : {}),
      };
      const stagePatch = stageChange
        ? stageChangeTimestampPatch(current, stageChange)
        : {};
      const updated: Project = {
        ...current,
        ...stagePatch,
        stage: stageChange ?? current.stage,
        comments: [...current.comments, comment],
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      recordChangeEvent({
        domain: "crm",
        entityType: "comment",
        entityId: comment.id,
        projectId,
        action: "create",
        summary: `${current.name}: added update${stageChange ? ` (→ ${STAGE_LABELS[stageChange]})` : ""}`,
        payloadJson: {
          stageChange: stageChange ?? null,
          preview: text.slice(0, 120),
        },
      });
      if (stageChange && stageChange !== current.stage) {
        recordChangeEvent({
          domain: "crm",
          entityType: "project",
          entityId: projectId,
          projectId,
          action: "stage_change",
          field: "stage",
          summary: `${current.name}: stage ${STAGE_LABELS[current.stage]} → ${STAGE_LABELS[stageChange]}`,
          payloadJson: {
            old: current.stage,
            new: stageChange,
          },
        });
      }
      if (supabase) {
        void supabase
          .from("project_comments")
          .insert({
            id: comment.id,
            project_id: projectId,
            text: comment.text,
            author: comment.author,
            ...(supportsCommentAuthorId
              ? { author_user_id: comment.authorUserId ?? null }
              : {}),
            stage_change: stageChange ?? null,
            created_at: comment.createdAt,
          })
          .then(logDbError("comment insert"));
        if (stageChange) {
          const row: Record<string, string | null> = { stage: stageChange };
          if (supportsMetricsFields) {
            if (stagePatch.hotLeadEnteredAt)
              row.hot_lead_entered_at = stagePatch.hotLeadEnteredAt;
            if (stagePatch.underDevelopmentAt)
              row.under_development_at = stagePatch.underDevelopmentAt;
            if (stagePatch.commissionedAt)
              row.commissioned_at = stagePatch.commissionedAt;
            if (stagePatch.cancelledAt)
              row.cancelled_at = stagePatch.cancelledAt;
          }
          void supabase
            .from("projects")
            .update(row)
            .eq("id", projectId)
            .then(logDbError("stage update"));
          if (supportsMetricsFields) {
            void supabase
              .from("project_stage_history")
              .insert({
                project_id: projectId,
                stage: stageChange,
                entered_at: todayDate(),
              })
              .then(logDbError("stage history insert"));
          }
        }
      }
      void requestAiSummary(updated);
    },
    [
      requestAiSummary,
      resolveAuthor,
      supportsCommentAuthorId,
      supportsMetricsFields,
      recordChangeEvent,
    ],
  );

  const updateProject = useCallback(
    (projectId: string, patch: ProjectPatch) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const stageExtras =
        patch.stage && patch.stage !== current.stage
          ? stageChangeTimestampPatch(current, patch.stage)
          : {};
      const mergedPatch = { ...stageExtras, ...patch };
      const updated: Project = { ...current, ...mergedPatch };
      // Empty strings clear optional text/date fields
      if (mergedPatch.hotLeadEnteredAt === "") delete updated.hotLeadEnteredAt;
      if (mergedPatch.underDevelopmentAt === "")
        delete updated.underDevelopmentAt;
      if (mergedPatch.commissionedAt === "") delete updated.commissionedAt;
      if (mergedPatch.cancelledAt === "") delete updated.cancelledAt;
      if (mergedPatch.cancellationReason === "")
        delete updated.cancellationReason;

      const diffs = summarizeCrmProjectPatch(
        current as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
        current.name,
      );
      for (const d of diffs) {
        recordChangeEvent({
          domain: "crm",
          entityType: "project",
          entityId: projectId,
          projectId,
          action: d.field === "stage" ? "stage_change" : "update",
          field: d.field,
          summary: d.summary,
          payloadJson: d.payload,
        });
      }

      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        const row: Record<string, string | number | boolean | null> = {};
        if (mergedPatch.name !== undefined) row.name = mergedPatch.name;
        if (mergedPatch.client !== undefined) row.client = mergedPatch.client;
        if (mergedPatch.country !== undefined) row.country = mergedPatch.country;
        if (mergedPatch.city !== undefined) row.city = mergedPatch.city;
        if (mergedPatch.series !== undefined) row.series = mergedPatch.series;
        if (mergedPatch.market !== undefined) row.market = mergedPatch.market;
        if (mergedPatch.sizeKw !== undefined) row.size_kw = mergedPatch.sizeKw;
        if (mergedPatch.stage !== undefined) row.stage = mergedPatch.stage;
        if (mergedPatch.baseDescription !== undefined)
          row.base_description = mergedPatch.baseDescription;
        if (mergedPatch.lastClientContactAt !== undefined)
          row.last_client_contact_at = mergedPatch.lastClientContactAt;
        if (mergedPatch.emailReminderDays !== undefined)
          row.email_reminder_days = mergedPatch.emailReminderDays;
        if (mergedPatch.emailReminderEnabled !== undefined)
          row.email_reminder_enabled = mergedPatch.emailReminderEnabled;
        if (supportsOwnershipFields && mergedPatch.leadUserId !== undefined) {
          row.lead_user_id = mergedPatch.leadUserId ?? null;
        }
        if (supportsMetricsFields) {
          if (mergedPatch.coldLeadEnteredAt !== undefined)
            row.cold_lead_entered_at = mergedPatch.coldLeadEnteredAt;
          if (mergedPatch.lastMeaningfulActivityAt !== undefined)
            row.last_meaningful_activity_at =
              mergedPatch.lastMeaningfulActivityAt;
          if (mergedPatch.cancellationReason !== undefined)
            row.cancellation_reason =
              mergedPatch.cancellationReason.trim() || null;
          if (mergedPatch.hotLeadEnteredAt !== undefined)
            row.hot_lead_entered_at = mergedPatch.hotLeadEnteredAt || null;
          if (mergedPatch.underDevelopmentAt !== undefined)
            row.under_development_at = mergedPatch.underDevelopmentAt || null;
          if (mergedPatch.commissionedAt !== undefined)
            row.commissioned_at = mergedPatch.commissionedAt || null;
          if (mergedPatch.cancelledAt !== undefined)
            row.cancelled_at = mergedPatch.cancelledAt || null;
        }
        void supabase
          .from("projects")
          .update(row)
          .eq("id", projectId)
          .then(logDbError("project update"));
        if (
          supportsMetricsFields &&
          patch.stage &&
          patch.stage !== current.stage
        ) {
          void supabase
            .from("project_stage_history")
            .insert({
              project_id: projectId,
              stage: patch.stage,
              entered_at: todayDate(),
            })
            .then(logDbError("stage history insert"));
        }
      }
      void requestAiSummary(updated);
    },
    [
      requestAiSummary,
      supportsOwnershipFields,
      supportsMetricsFields,
      recordChangeEvent,
    ],
  );

  const markClientContacted = useCallback(
    (projectId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const lastClientContactAt = todayDate();
      const updated: Project = {
        ...current,
        lastClientContactAt,
        lastMeaningfulActivityAt: lastClientContactAt,
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        const row: Record<string, string> = {
          last_client_contact_at: lastClientContactAt,
        };
        if (supportsMetricsFields) {
          row.last_meaningful_activity_at = lastClientContactAt;
        }
        void supabase
          .from("projects")
          .update(row)
          .eq("id", projectId)
          .then(logDbError("mark client contacted"));
      }
    },
    [supportsMetricsFields],
  );

  const updateComment = useCallback(
    (projectId: string, commentId: string, text: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = {
        ...current,
        comments: current.comments.map((c) =>
          c.id === commentId ? { ...c, text } : c,
        ),
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      recordChangeEvent({
        domain: "crm",
        entityType: "comment",
        entityId: commentId,
        projectId,
        action: "update",
        summary: `${current.name}: edited update`,
        payloadJson: { preview: text.slice(0, 120) },
      });
      if (supabase) {
        void supabase
          .from("project_comments")
          .update({ text })
          .eq("id", commentId)
          .then(logDbError("comment update"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary, recordChangeEvent],
  );

  const deleteComment = useCallback(
    (projectId: string, commentId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = {
        ...current,
        comments: current.comments.filter((c) => c.id !== commentId),
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      recordChangeEvent({
        domain: "crm",
        entityType: "comment",
        entityId: commentId,
        projectId,
        action: "delete",
        summary: `${current.name}: deleted update`,
      });
      if (supabase) {
        void supabase
          .from("project_comments")
          .delete()
          .eq("id", commentId)
          .then(logDbError("comment delete"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary, recordChangeEvent],
  );

  const regenerateSummary = useCallback(
    (projectId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      if (project) void requestAiSummary(project);
    },
    [requestAiSummary],
  );

  const mutateTodos = useCallback(
    (projectId: string, fn: (todos: ProjectTodo[]) => ProjectTodo[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, todos: fn(p.todos) } : p,
        ),
      );
    },
    [],
  );

  const addTodo = useCallback(
    (
      projectId: string,
      kind: TodoKind,
      text: string,
      dueDate?: string,
      ownerUserId?: string,
    ) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const todo: ProjectTodo = {
        id: crypto.randomUUID(),
        kind,
        text,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateTodos(projectId, (todos) => [...todos, todo]);
      recordChangeEvent({
        domain: "crm",
        entityType: "todo",
        entityId: todo.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: added ${kind} — ${text.slice(0, 80)}`,
        payloadJson: { kind, dueDate: dueDate ?? null },
      });
      if (supabase) {
        void supabase
          .from("project_todos")
          .insert({
            id: todo.id,
            project_id: projectId,
            kind: todo.kind,
            text: todo.text,
            done: false,
            due_date: dueDate ?? null,
            ...(supportsOwnershipFields
              ? { owner_user_id: todo.ownerUserId ?? null }
              : {}),
            created_at: todo.createdAt,
          })
          .then(logDbError("todo insert"));
      }
    },
    [mutateTodos, supportsOwnershipFields, recordChangeEvent],
  );

  const toggleTodo = useCallback(
    (projectId: string, todoId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const current = project?.todos.find((t) => t.id === todoId);
      if (!current) return;
      const done = !current.done;
      const doneAt = done ? new Date().toISOString() : undefined;
      mutateTodos(projectId, (todos) =>
        todos.map((t) => (t.id === todoId ? { ...t, done, doneAt } : t)),
      );
      recordChangeEvent({
        domain: "crm",
        entityType: "todo",
        entityId: todoId,
        projectId,
        action: done ? "complete" : "reopen",
        summary: `${project?.name ?? projectId}: ${done ? "completed" : "reopened"} todo — ${current.text.slice(0, 80)}`,
        payloadJson: { done },
      });
      if (supabase) {
        void supabase
          .from("project_todos")
          .update({ done, done_at: doneAt ?? null })
          .eq("id", todoId)
          .then(logDbError("todo toggle"));
      }
    },
    [mutateTodos, recordChangeEvent],
  );

  const updateTodo = useCallback(
    (projectId: string, todoId: string, patch: TodoPatch) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      mutateTodos(projectId, (todos) =>
        todos.map((t) => {
          if (t.id !== todoId) return t;
          const next = { ...t };
          if (patch.text !== undefined) next.text = patch.text;
          if (patch.answer !== undefined) {
            if (patch.answer === null) delete next.answer;
            else next.answer = patch.answer;
          }
          if (patch.dueDate !== undefined) {
            if (patch.dueDate === null) delete next.dueDate;
            else next.dueDate = patch.dueDate;
          }
          if (patch.ownerUserId !== undefined) {
            if (patch.ownerUserId === null) delete next.ownerUserId;
            else next.ownerUserId = patch.ownerUserId;
          }
          return next;
        }),
      );
      recordChangeEvent({
        domain: "crm",
        entityType: "todo",
        entityId: todoId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated todo`,
        payloadJson: {
          text: patch.text ?? null,
          dueDate: patch.dueDate ?? null,
        },
      });
      if (supabase) {
        const row: Record<string, string | null> = {};
        if (patch.text !== undefined) row.text = patch.text;
        if (patch.answer !== undefined) row.answer = patch.answer;
        if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
        if (supportsOwnershipFields && patch.ownerUserId !== undefined) {
          row.owner_user_id = patch.ownerUserId;
        }
        void supabase
          .from("project_todos")
          .update(row)
          .eq("id", todoId)
          .then(logDbError("todo update"));
      }
    },
    [mutateTodos, supportsOwnershipFields, recordChangeEvent],
  );

  const deleteTodo = useCallback(
    (projectId: string, todoId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const todo = project?.todos.find((t) => t.id === todoId);
      mutateTodos(projectId, (todos) => todos.filter((t) => t.id !== todoId));
      recordChangeEvent({
        domain: "crm",
        entityType: "todo",
        entityId: todoId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted todo${todo ? ` — ${todo.text.slice(0, 80)}` : ""}`,
      });
      if (supabase) {
        void supabase
          .from("project_todos")
          .delete()
          .eq("id", todoId)
          .then(logDbError("todo delete"));
      }
    },
    [mutateTodos, recordChangeEvent],
  );

  const mutateContacts = useCallback(
    (projectId: string, fn: (contacts: ProjectContact[]) => ProjectContact[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, contacts: fn(p.contacts) } : p,
        ),
      );
    },
    [],
  );

  const addContact = useCallback(
    (projectId: string, input: ContactInput) => {
      const name = input.name?.trim();
      const email = input.email?.trim();
      const phone = input.phone?.trim();
      const position = input.position?.trim();
      if (!name && !email && !phone && !position) return;
      const project = projectsRef.current.find((p) => p.id === projectId);
      const contact: ProjectContact = {
        id: crypto.randomUUID(),
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(position ? { position } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateContacts(projectId, (contacts) => [...contacts, contact]);
      recordChangeEvent({
        domain: "crm",
        entityType: "contact",
        entityId: contact.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: added contact ${name || email || phone || "—"}`,
        payloadJson: { name: name ?? null, email: email ?? null },
      });
      if (supabase) {
        void supabase
          .from("project_contacts")
          .insert({
            id: contact.id,
            project_id: projectId,
            name: name || null,
            email: email || null,
            phone: phone || null,
            position: position || null,
            created_at: contact.createdAt,
          })
          .then(logDbError("contact insert"));
      }
    },
    [mutateContacts, recordChangeEvent],
  );

  const updateContact = useCallback(
    (projectId: string, contactId: string, patch: ContactInput) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      mutateContacts(projectId, (contacts) =>
        contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next = { ...c };
          for (const key of ["name", "email", "phone", "position"] as const) {
            const value = patch[key];
            if (value === undefined) continue;
            const trimmed = value.trim();
            if (trimmed) next[key] = trimmed;
            else delete next[key];
          }
          return next;
        }),
      );
      recordChangeEvent({
        domain: "crm",
        entityType: "contact",
        entityId: contactId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated contact`,
        payloadJson: {
          name: patch.name ?? null,
          email: patch.email ?? null,
        },
      });
      if (supabase) {
        const row: Record<string, string | null> = {};
        for (const key of ["name", "email", "phone", "position"] as const) {
          const value = patch[key];
          if (value !== undefined) row[key] = value.trim() || null;
        }
        void supabase
          .from("project_contacts")
          .update(row)
          .eq("id", contactId)
          .then(logDbError("contact update"));
      }
    },
    [mutateContacts, recordChangeEvent],
  );

  const deleteContact = useCallback(
    (projectId: string, contactId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const contact = project?.contacts.find((c) => c.id === contactId);
      mutateContacts(projectId, (contacts) =>
        contacts.filter((c) => c.id !== contactId),
      );
      recordChangeEvent({
        domain: "crm",
        entityType: "contact",
        entityId: contactId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted contact ${contact?.name || contact?.email || contactId}`,
      });
      if (supabase) {
        void supabase
          .from("project_contacts")
          .delete()
          .eq("id", contactId)
          .then(logDbError("contact delete"));
      }
    },
    [mutateContacts, recordChangeEvent],
  );

  const mutateFiles = useCallback(
    (projectId: string, fn: (files: ProjectFile[]) => ProjectFile[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, files: fn(p.files ?? []) } : p,
        ),
      );
    },
    [],
  );

  const addProjectFile = useCallback(
    async (
      projectId: string,
      file: File,
      kind: ProjectFileKind,
      note?: string,
    ): Promise<{ ok: true; file: ProjectFile } | { ok: false; error: string }> => {
      if (file.size <= 0) {
        return { ok: false, error: "The selected file is empty." };
      }
      if (file.size > MAX_FILE_BYTES) {
        return {
          ok: false,
          error: `File is too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).`,
        };
      }

      const author = resolveAuthor();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const safeName = file.name.replace(/[^\w.\- ()[\]]+/g, "_");
      const storagePath = `${projectId}/${id}/${safeName}`;

      const record: ProjectFile = {
        id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind,
        ...(note?.trim() ? { note: note.trim() } : {}),
        storagePath,
        ...(author.authorUserId
          ? { uploadedByUserId: author.authorUserId }
          : {}),
        uploadedByName: author.author,
        createdAt,
      };

      if (supabase) {
        const { error: uploadError } = await supabase.storage
          .from(FILE_STORAGE_BUCKET)
          .upload(storagePath, file, {
            contentType: record.mimeType,
            upsert: false,
          });
        if (uploadError) {
          return {
            ok: false,
            error: uploadError.message || "Upload to storage failed.",
          };
        }

        const { error: insertError } = await supabase
          .from("project_files")
          .insert({
            id: record.id,
            project_id: projectId,
            name: record.name,
            mime_type: record.mimeType,
            size_bytes: record.sizeBytes,
            kind: record.kind,
            note: record.note ?? null,
            storage_path: record.storagePath,
            uploaded_by_user_id: record.uploadedByUserId ?? null,
            uploaded_by_name: record.uploadedByName ?? null,
            created_at: record.createdAt,
          });
        if (insertError) {
          void supabase.storage.from(FILE_STORAGE_BUCKET).remove([storagePath]);
          return {
            ok: false,
            error: insertError.message || "Could not save file metadata.",
          };
        }
      } else {
        // Local fallback: keep a data URL so downloads still work offline.
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("read failed"));
            reader.readAsDataURL(file);
          });
          record.localDataUrl = dataUrl;
        } catch {
          return { ok: false, error: "Could not read the selected file." };
        }
      }

      mutateFiles(projectId, (files) => [record, ...files]);
      const project = projectsRef.current.find((p) => p.id === projectId);
      recordChangeEvent({
        domain: "crm",
        entityType: "file",
        entityId: record.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: uploaded file ${record.name}`,
        payloadJson: { kind: record.kind, name: record.name },
      });
      return { ok: true, file: record };
    },
    [mutateFiles, resolveAuthor, recordChangeEvent],
  );

  const updateProjectFile = useCallback(
    (
      projectId: string,
      fileId: string,
      patch: { kind?: ProjectFileKind; note?: string | null },
    ) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const file = project?.files?.find((f) => f.id === fileId);
      mutateFiles(projectId, (files) =>
        files.map((f) => {
          if (f.id !== fileId) return f;
          const next = { ...f };
          if (patch.kind !== undefined) next.kind = patch.kind;
          if (patch.note !== undefined) {
            if (patch.note === null || !patch.note.trim()) delete next.note;
            else next.note = patch.note.trim();
          }
          return next;
        }),
      );
      recordChangeEvent({
        domain: "crm",
        entityType: "file",
        entityId: fileId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated file ${file?.name ?? fileId}`,
        payloadJson: {
          kind: patch.kind ?? null,
          note: patch.note ?? null,
        },
      });
      if (supabase) {
        const row: Record<string, string | null> = {};
        if (patch.kind !== undefined) row.kind = patch.kind;
        if (patch.note !== undefined) {
          row.note = patch.note && patch.note.trim() ? patch.note.trim() : null;
        }
        void supabase
          .from("project_files")
          .update(row)
          .eq("id", fileId)
          .then(logDbError("file update"));
      }
    },
    [mutateFiles, recordChangeEvent],
  );

  const deleteProjectFile = useCallback(
    async (projectId: string, fileId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const current = project?.files?.find((f) => f.id === fileId);
      mutateFiles(projectId, (files) => files.filter((f) => f.id !== fileId));
      recordChangeEvent({
        domain: "crm",
        entityType: "file",
        entityId: fileId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted file ${current?.name ?? fileId}`,
        payloadJson: { name: current?.name ?? null },
      });
      if (supabase && current) {
        void supabase
          .from("project_files")
          .delete()
          .eq("id", fileId)
          .then(logDbError("file delete"));
        if (current.storagePath) {
          void supabase.storage
            .from(FILE_STORAGE_BUCKET)
            .remove([current.storagePath])
            .then(({ error }) => {
              if (error)
                console.error("Supabase file storage delete failed:", error.message);
            });
        }
      }
    },
    [mutateFiles, recordChangeEvent],
  );

  const getProjectFileUrl = useCallback(async (file: ProjectFile) => {
    if (file.localDataUrl) return file.localDataUrl;
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(FILE_STORAGE_BUCKET)
      .createSignedUrl(file.storagePath, 60 * 60);
    if (error) {
      console.error("Supabase signed URL failed:", error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  const mutateFinancials = useCallback(
    (projectId: string, fn: (f: ProjectFinancials) => ProjectFinancials) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, financials: fn(p.financials) } : p,
        ),
      );
    },
    [],
  );

  const updateFinancials = useCallback(
    (projectId: string, patch: FinancialsPatch) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const projectName = current?.name ?? projectId;
      const before = current?.financials;

      const fieldDefs: {
        key: keyof FinancialsPatch;
        label: string;
        read: (f: ProjectFinancials | undefined) => string;
      }[] = [
        {
          key: "contractValue",
          label: "contract_value",
          read: (f) => formatValue(f?.contractValue),
        },
        {
          key: "contractSignedDate",
          label: "contract_signed_date",
          read: (f) => f?.contractSignedDate ?? "",
        },
        {
          key: "expenses",
          label: "expenses",
          read: (f) => formatValue(f?.expenses),
        },
        {
          key: "maxMaterialsExpense",
          label: "max_materials_expense",
          read: (f) => formatValue(f?.maxMaterialsExpense),
        },
        {
          key: "maxManHrExpense",
          label: "max_man_hr_expense",
          read: (f) => formatValue(f?.maxManHrExpense),
        },
      ];

      for (const def of fieldDefs) {
        if (patch[def.key] === undefined) continue;
        const oldValue = def.read(before);
        const newValue =
          patch[def.key] === null ? "" : formatValue(patch[def.key]);
        if (oldValue === newValue) continue;
        const summary = summarizeFinancialFieldChange(
          projectName,
          def.label,
          oldValue,
          newValue,
        );
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "project_financials",
            entityId: projectId,
            projectId,
            action: "update",
            field: def.label,
            summary,
            payloadJson: { field: def.label },
          },
          {
            projectId,
            projectName,
            entityType: "project_financials",
            entityId: projectId,
            action: "update",
            field: def.label,
            oldValue,
            newValue,
            summary,
          },
        );
      }

      mutateFinancials(projectId, (f) => {
        const next = { ...f };
        if (patch.contractValue !== undefined) {
          if (patch.contractValue === null) delete next.contractValue;
          else next.contractValue = patch.contractValue;
        }
        if (patch.contractSignedDate !== undefined) {
          if (patch.contractSignedDate === null) delete next.contractSignedDate;
          else next.contractSignedDate = patch.contractSignedDate;
        }
        if (patch.expenses !== undefined) {
          if (patch.expenses === null) delete next.expenses;
          else next.expenses = patch.expenses;
        }
        if (patch.maxMaterialsExpense !== undefined) {
          if (patch.maxMaterialsExpense === null) delete next.maxMaterialsExpense;
          else next.maxMaterialsExpense = patch.maxMaterialsExpense;
        }
        if (patch.maxManHrExpense !== undefined) {
          if (patch.maxManHrExpense === null) delete next.maxManHrExpense;
          else next.maxManHrExpense = patch.maxManHrExpense;
        }
        if (next.contractValue != null && next.expenses != null) {
          next.expectedProfit = next.contractValue - next.expenses;
        } else {
          delete next.expectedProfit;
        }
        return next;
      });
    },
    [mutateFinancials, recordChangeEvent],
  );

  const addPayment = useCallback(
    (projectId: string, input: PaymentInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const isMaintenance = Boolean(input.isMaintenance);
      const linkedDate = isMaintenance
        ? undefined
        : resolveLinkedDeadlineDate(input.milestoneId, current);
      const dueDate = linkedDate ?? input.dueDate;
      const payment: ProjectPayment = {
        id: crypto.randomUUID(),
        amount: input.amount,
        ...(input.percent != null ? { percent: input.percent } : {}),
        dueDate,
        ...(input.actualDate ? { actualDate: input.actualDate } : {}),
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(isMaintenance ? { isMaintenance: true } : {}),
        ...(!isMaintenance && input.milestoneId && linkedDate
          ? { milestoneId: input.milestoneId }
          : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: [...(f.payments ?? []), payment],
      }));
      const projectName = current?.name ?? projectId;
      const summary = `${projectName}: added payment ${payment.label ?? payment.id} (${formatValue(payment.amount)})`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "payment",
          entityId: payment.id,
          projectId,
          action: "create",
          summary,
          payloadJson: { label: payment.label ?? null },
        },
        {
          projectId,
          projectName,
          entityType: "payment",
          entityId: payment.id,
          action: "create",
          newValue: formatValue(payment.amount),
          summary,
        },
      );
    },
    [mutateFinancials, recordChangeEvent],
  );

  const updatePayment = useCallback(
    (projectId: string, paymentId: string, patch: PaymentInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = current?.financials?.payments.find((p) => p.id === paymentId);
      const isMaintenance =
        patch.isMaintenance === undefined
          ? undefined
          : Boolean(patch.isMaintenance);
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.map((p) => {
          if (p.id !== paymentId) return p;
          const nextMaint =
            isMaintenance !== undefined ? isMaintenance : Boolean(p.isMaintenance);
          const linkedDate =
            nextMaint
              ? undefined
              : resolveLinkedDeadlineDate(patch.milestoneId, current);
          const dueDate = linkedDate ?? patch.dueDate;
          const next: ProjectPayment = {
            id: p.id,
            amount: patch.amount,
            dueDate,
            createdAt: p.createdAt,
          };
          if (patch.percent != null) next.percent = patch.percent;
          else if (p.percent != null) next.percent = p.percent;
          if (patch.label !== undefined) {
            if (patch.label.trim()) next.label = patch.label.trim();
          } else if (p.label) {
            next.label = p.label;
          }
          if (nextMaint) {
            next.isMaintenance = true;
          }
          if (!nextMaint && patch.milestoneId && linkedDate) {
            next.milestoneId = patch.milestoneId;
          }
          // falsy milestoneId or maintenance clears the link
          if (patch.actualDate !== undefined) {
            if (patch.actualDate) next.actualDate = patch.actualDate;
          } else if (p.actualDate) {
            next.actualDate = p.actualDate;
          }
          return next;
        }),
      }));
      if (before && before.amount !== patch.amount) {
        const projectName = current?.name ?? projectId;
        const summary = summarizeFinancialFieldChange(
          projectName,
          "payment_amount",
          formatValue(before.amount),
          formatValue(patch.amount),
        );
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "payment",
            entityId: paymentId,
            projectId,
            action: "update",
            field: "amount",
            summary,
            payloadJson: { field: "amount" },
          },
          {
            projectId,
            projectName,
            entityType: "payment",
            entityId: paymentId,
            action: "update",
            field: "amount",
            oldValue: formatValue(before.amount),
            newValue: formatValue(patch.amount),
            summary,
          },
        );
      }
    },
    [mutateFinancials, recordChangeEvent],
  );

  const deletePayment = useCallback(
    (projectId: string, paymentId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = current?.financials?.payments.find((p) => p.id === paymentId);
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.filter((p) => p.id !== paymentId),
      }));
      if (before) {
        const projectName = current?.name ?? projectId;
        const summary = `${projectName}: deleted payment ${before.label ?? paymentId} (${formatValue(before.amount)})`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "payment",
            entityId: paymentId,
            projectId,
            action: "delete",
            summary,
            payloadJson: { label: before.label ?? null },
          },
          {
            projectId,
            projectName,
            entityType: "payment",
            entityId: paymentId,
            action: "delete",
            oldValue: formatValue(before.amount),
            summary,
          },
        );
      }
    },
    [mutateFinancials, recordChangeEvent],
  );

  const addExpense = useCallback(
    (projectId: string, input: ExpenseInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linkedDate = resolveLinkedDeadlineDate(input.milestoneId, current);
      const dueDate = linkedDate ?? input.dueDate;
      const expense: ProjectExpenseItem = {
        id: crypto.randomUUID(),
        amount: input.amount,
        category: input.category,
        ...(input.percent != null ? { percent: input.percent } : {}),
        ...(input.amountExVat != null && input.amountExVat > 0
          ? { amountExVat: input.amountExVat }
          : {}),
        dueDate,
        ...(input.actualDate ? { actualDate: input.actualDate } : {}),
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(categoryHasSubcategories(input.category) &&
        input.subcategory &&
        input.subcategory !== null
          ? { subcategory: input.subcategory }
          : {}),
        ...(input.milestoneId && linkedDate
          ? { milestoneId: input.milestoneId }
          : {}),
        ...(input.warehouseLotId
          ? { warehouseLotId: input.warehouseLotId }
          : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: [...(f.expenseSchedule ?? []), expense],
      }));
      const projectName = current?.name ?? projectId;
      const summary = `${projectName}: added expense ${expense.label ?? expense.id} (${formatValue(expense.amount)})`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "expense",
          entityId: expense.id,
          projectId,
          action: "create",
          summary,
          payloadJson: { category: expense.category },
        },
        {
          projectId,
          projectName,
          entityType: "expense",
          entityId: expense.id,
          action: "create",
          newValue: formatValue(expense.amount),
          summary,
        },
      );
    },
    [mutateFinancials, recordChangeEvent],
  );

  const updateExpense = useCallback(
    (projectId: string, expenseId: string, patch: ExpenseInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = (current?.financials?.expenseSchedule ?? []).find(
        (e) => e.id === expenseId,
      );
      const linkedDate = resolveLinkedDeadlineDate(patch.milestoneId, current);
      const dueDate = linkedDate ?? patch.dueDate;
      const lotId =
        (patch.warehouseLotId !== undefined
          ? patch.warehouseLotId
          : before?.warehouseLotId) || undefined;

      const buildNext = (e: ProjectExpenseItem): ProjectExpenseItem => {
        const next: ProjectExpenseItem = {
          id: e.id,
          amount: patch.amount,
          category: patch.category,
          dueDate,
          createdAt: e.createdAt,
        };
        if (patch.percent != null) next.percent = patch.percent;
        else if (e.percent != null) next.percent = e.percent;

        if (patch.amountExVat != null && patch.amountExVat > 0) {
          next.amountExVat = patch.amountExVat;
        } else if (patch.amountExVat === null) {
          // cleared intentionally
        } else if (e.amountExVat != null) {
          next.amountExVat = e.amountExVat;
        }

        if (patch.label !== undefined) {
          if (patch.label.trim()) next.label = patch.label.trim();
        } else if (e.label) {
          next.label = e.label;
        }

        if (patch.milestoneId) {
          if (linkedDate) next.milestoneId = patch.milestoneId;
        }

        if (patch.actualDate !== undefined) {
          if (patch.actualDate) next.actualDate = patch.actualDate;
        } else if (e.actualDate) {
          next.actualDate = e.actualDate;
        }

        if (categoryHasSubcategories(patch.category)) {
          if (patch.subcategory) next.subcategory = patch.subcategory;
          else if (patch.subcategory === null) {
            // cleared
          } else if (e.subcategory) {
            next.subcategory = e.subcategory;
          }
        }

        if (patch.warehouseLotId !== undefined) {
          if (patch.warehouseLotId) next.warehouseLotId = patch.warehouseLotId;
        } else if (e.warehouseLotId) {
          next.warehouseLotId = e.warehouseLotId;
        }

        if (e.budgetAmount != null && e.budgetAmount > 0) {
          next.budgetAmount = e.budgetAmount;
        }

        return next;
      };

      const amountChanged = Boolean(before && before.amount !== patch.amount);
      const scale =
        before && before.amount > 0 && amountChanged
          ? patch.amount / before.amount
          : 1;

      let budgetSettledTo: number | null = null;

      if (lotId && typeof lotId === "string") {
        setProjects((prev) =>
          prev.map((p) => {
            const schedule = [...(p.financials.expenseSchedule ?? [])];
            let changed = false;
            for (let i = 0; i < schedule.length; i++) {
              const e = schedule[i];
              if (p.id === projectId && e.id === expenseId) {
                schedule[i] = buildNext(e);
                changed = true;
                continue;
              }
              if (e.warehouseLotId !== lotId) continue;
              // Sibling slices for the same lot: keep purchase dates / meta aligned
              const sib: ProjectExpenseItem = {
                ...e,
                dueDate,
                category: patch.category,
              };
              if (patch.actualDate !== undefined) {
                if (patch.actualDate) sib.actualDate = patch.actualDate;
                else delete sib.actualDate;
              }
              if (patch.label !== undefined) {
                if (patch.label.trim()) sib.label = patch.label.trim();
                else delete sib.label;
              } else if (e.label) {
                sib.label = e.label;
              }
              if (categoryHasSubcategories(patch.category)) {
                if (patch.subcategory) sib.subcategory = patch.subcategory;
                else if (patch.subcategory === null) delete sib.subcategory;
                else if (e.subcategory) sib.subcategory = e.subcategory;
              } else {
                delete sib.subcategory;
              }
              if (scale !== 1) {
                sib.amount = roundMoney(e.amount * scale);
                if (e.amountExVat != null) {
                  sib.amountExVat = roundMoney(e.amountExVat * scale);
                } else if (patch.amountExVat != null && before) {
                  sib.amountExVat = roundMoney(
                    (patch.amountExVat / Math.max(before.amount, 0.01)) *
                      e.amount,
                  );
                }
              }
              schedule[i] = sib;
              changed = true;
            }
            if (!changed) return p;
            return {
              ...p,
              financials: { ...p.financials, expenseSchedule: schedule },
            };
          }),
        );

        setWarehouse((prev) => ({
          ...prev,
          lots: prev.lots.map((lot) => {
            if (lot.id !== lotId) return lot;
            const next = { ...lot };
            next.receivedAt = dueDate;
            if (patch.label !== undefined && patch.label.trim()) {
              next.label = patch.label.trim();
            }
            next.category = patch.category;
            if (categoryHasSubcategories(patch.category) && patch.subcategory) {
              next.subcategory = patch.subcategory;
            } else if (!categoryHasSubcategories(patch.category)) {
              delete next.subcategory;
            }
            if (scale !== 1) {
              next.unitCostIncVat = roundMoney(lot.unitCostIncVat * scale);
              next.unitCostExVat = roundMoney(lot.unitCostExVat * scale);
            }
            return next;
          }),
        }));

        recordChangeEvent({
          domain: "warehouse",
          entityType: "lot",
          entityId: lotId,
          projectId,
          action: "update",
          summary: amountChanged
            ? `Synced warehouse lot from expense edit (cost scale ${scale.toFixed(4)})`
            : `Synced warehouse lot metadata from expense edit`,
          payloadJson: {
            expenseId,
            ...(amountChanged ? { costScaled: true } : {}),
          },
        });
      } else {
        const markingPaid =
          Boolean(before) &&
          !before!.actualDate &&
          Boolean(patch.actualDate) &&
          !before!.warehouseLotId;
        const spent = markingPaid
          ? spentAgainstExpense(warehouseRef.current.lots, expenseId)
          : 0;
        const spentEx =
          markingPaid && spent > 0
            ? spentAgainstExpenseEx(warehouseRef.current.lots, expenseId)
            : 0;
        const settleToSpent = markingPaid && spent > 0;
        if (settleToSpent) budgetSettledTo = spent;

        mutateFinancials(projectId, (f) => ({
          ...f,
          expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
            if (e.id !== expenseId) return e;
            const next = buildNext(e);
            if (!settleToSpent) return next;
            const kept = preserveBudgetAmount(e, spent);
            next.amount = roundMoney(spent);
            if (spentEx > 0) next.amountExVat = roundMoney(spentEx);
            else next.amountExVat = amountExFromInc(spent);
            if (kept != null) next.budgetAmount = kept;
            return next;
          }),
        }));

        if (
          settleToSpent &&
          before &&
          Math.abs(before.amount - spent) >= 0.01
        ) {
          const projectName = current?.name ?? projectId;
          const summary = `${projectName}: settled predicted expense to WH spent ${formatValue(spent)}`;
          recordChangeEvent(
            {
              id: createEventId(),
              domain: "finance_meta",
              entityType: "expense",
              entityId: expenseId,
              projectId,
              action: "update",
              field: "amount",
              summary,
              payloadJson: {
                field: "amount",
                reason: "budget_settle",
              },
            },
            {
              projectId,
              projectName,
              entityType: "expense",
              entityId: expenseId,
              action: "update",
              field: "amount",
              oldValue: formatValue(before.amount),
              newValue: formatValue(spent),
              summary,
            },
          );
        }
      }

      if (before && before.amount !== patch.amount && budgetSettledTo == null) {
        const projectName = current?.name ?? projectId;
        const summary = summarizeFinancialFieldChange(
          projectName,
          "expense_amount",
          formatValue(before.amount),
          formatValue(patch.amount),
        );
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "expense",
            entityId: expenseId,
            projectId,
            action: "update",
            field: "amount",
            summary,
            payloadJson: { field: "amount", ...(lotId ? { lotId } : {}) },
          },
          {
            projectId,
            projectName,
            entityType: "expense",
            entityId: expenseId,
            action: "update",
            field: "amount",
            oldValue: formatValue(before.amount),
            newValue: formatValue(patch.amount),
            summary,
          },
        );
      }
    },
    [mutateFinancials, recordChangeEvent],
  );

  const deleteExpense = useCallback(
    (
      projectId: string,
      expenseId: string,
    ): { ok: true } | { ok: false; error: string } => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = (current?.financials?.expenseSchedule ?? []).find(
        (e) => e.id === expenseId,
      );
      if (before?.warehouseLotId) {
        return deleteWarehouseLotRef.current(before.warehouseLotId);
      }
      // Budget envelope with WH draws: remove linked lots first
      const linkedLots = warehouseRef.current.lots.filter(
        (l) => l.expenseId === expenseId,
      );
      for (const lot of linkedLots) {
        const res = deleteWarehouseLotRef.current(lot.id);
        if (!res.ok) return res;
      }
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: (f.expenseSchedule ?? []).filter(
          (e) => e.id !== expenseId,
        ),
      }));
      if (before) {
        const projectName = current?.name ?? projectId;
        const summary = `${projectName}: deleted expense ${before.label ?? expenseId} (${formatValue(before.amount)})`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "expense",
            entityId: expenseId,
            projectId,
            action: "delete",
            summary,
            payloadJson: { category: before.category },
          },
          {
            projectId,
            projectName,
            entityType: "expense",
            entityId: expenseId,
            action: "delete",
            oldValue: formatValue(before.amount),
            summary,
          },
        );
      }
      return { ok: true };
    },
    [mutateFinancials, recordChangeEvent],
  );

  const addMilestone = useCallback(
    (projectId: string, input: MilestoneInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const milestone: ProjectMilestone = {
        id: crypto.randomUUID(),
        kind: input.kind,
        date: input.date,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: [...f.milestones, milestone],
      }));
      const projectName = current?.name ?? projectId;
      const summary = `${projectName}: added milestone ${milestone.kind} (${milestone.date})`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "milestone",
          entityId: milestone.id,
          projectId,
          action: "create",
          summary,
          payloadJson: { kind: milestone.kind, date: milestone.date },
        },
        {
          projectId,
          projectName,
          entityType: "milestone",
          entityId: milestone.id,
          action: "create",
          newValue: milestone.date,
          summary,
        },
      );
    },
    [mutateFinancials, recordChangeEvent],
  );

  const updateMilestone = useCallback(
    (projectId: string, milestoneId: string, patch: MilestoneInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = current?.financials?.milestones.find(
        (m) => m.id === milestoneId,
      );
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: f.milestones.map((m) =>
          m.id === milestoneId
            ? {
              ...m,
              kind: patch.kind,
              date: patch.date,
              ...(patch.note?.trim()
                ? { note: patch.note.trim() }
                : { note: undefined }),
            }
            : m,
        ),
        payments: f.payments.map((p) =>
          p.milestoneId === milestoneId ? { ...p, dueDate: patch.date } : p,
        ),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) =>
          e.milestoneId === milestoneId ? { ...e, dueDate: patch.date } : e,
        ),
      }));
      if (before && (before.date !== patch.date || before.kind !== patch.kind)) {
        const projectName = current?.name ?? projectId;
        const summary = `${projectName}: milestone ${before.kind}/${before.date} → ${patch.kind}/${patch.date}`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "milestone",
            entityId: milestoneId,
            projectId,
            action: "update",
            summary,
            payloadJson: {
              oldKind: before.kind,
              newKind: patch.kind,
              oldDate: before.date,
              newDate: patch.date,
            },
          },
          {
            projectId,
            projectName,
            entityType: "milestone",
            entityId: milestoneId,
            action: "update",
            oldValue: `${before.kind}:${before.date}`,
            newValue: `${patch.kind}:${patch.date}`,
            summary,
          },
        );
      }
    },
    [mutateFinancials, recordChangeEvent],
  );

  const deleteMilestone = useCallback(
    (projectId: string, milestoneId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const before = current?.financials?.milestones.find(
        (m) => m.id === milestoneId,
      );
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: f.milestones.filter((m) => m.id !== milestoneId),
        payments: f.payments.map((p) => {
          if (p.milestoneId !== milestoneId) return p;
          const next = { ...p };
          delete next.milestoneId;
          return next;
        }),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (e.milestoneId !== milestoneId) return e;
          const next = { ...e };
          delete next.milestoneId;
          return next;
        }),
      }));
      if (before) {
        const projectName = current?.name ?? projectId;
        const summary = `${projectName}: deleted milestone ${before.kind} (${before.date})`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "milestone",
            entityId: milestoneId,
            projectId,
            action: "delete",
            summary,
            payloadJson: { kind: before.kind, date: before.date },
          },
          {
            projectId,
            projectName,
            entityType: "milestone",
            entityId: milestoneId,
            action: "delete",
            oldValue: before.date,
            summary,
          },
        );
      }
    },
    [mutateFinancials, recordChangeEvent],
  );

  const mutateSchedule = useCallback(
    (projectId: string, fn: (s: ProjectSchedule) => ProjectSchedule) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, schedule: fn(p.schedule ?? emptySchedule()) }
            : p,
        ),
      );
    },
    [],
  );

  const addGanttPhase = useCallback(
    (projectId: string, input: GanttPhaseInput) => {
      const name = input.name.trim();
      if (!name || !input.startDate) return;
      const durationDays = Math.max(1, Math.round(input.durationDays) || 1);
      const project = projectsRef.current.find((p) => p.id === projectId);
      const existing = project?.schedule?.phases ?? [];
      const color =
        input.color ??
        GANTT_PHASE_COLORS[existing.length % GANTT_PHASE_COLORS.length];
      const phase: ProjectGanttPhase = {
        id: crypto.randomUUID(),
        name,
        startDate: input.startDate,
        durationDays,
        color,
        ...(input.wbs?.trim() ? { wbs: input.wbs.trim() } : {}),
        ...(input.owner?.trim() ? { owner: input.owner.trim() } : {}),
        ...(input.actualStartDate
          ? { actualStartDate: input.actualStartDate }
          : {}),
        ...(input.actualDurationDays != null && input.actualDurationDays >= 1
          ? {
            actualDurationDays: Math.max(
              1,
              Math.round(input.actualDurationDays),
            ),
          }
          : {}),
        sortOrder:
          input.sortOrder ??
          (existing.length > 0
            ? Math.max(...existing.map((p) => p.sortOrder)) + 1
            : 0),
        createdAt: new Date().toISOString(),
      };
      mutateSchedule(projectId, (s) => ({
        ...s,
        phases: [...s.phases, phase],
      }));
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_phase",
        entityId: phase.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: added phase ${phase.name}`,
        payloadJson: {
          name: phase.name,
          startDate: phase.startDate,
          durationDays: phase.durationDays,
        },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_phases")
          .insert({
            id: phase.id,
            project_id: projectId,
            name: phase.name,
            start_date: phase.startDate,
            duration_days: phase.durationDays,
            actual_start_date: phase.actualStartDate ?? null,
            actual_duration_days: phase.actualDurationDays ?? null,
            color: phase.color ?? null,
            wbs: phase.wbs ?? null,
            owner: phase.owner ?? null,
            sort_order: phase.sortOrder,
            created_at: phase.createdAt,
          })
          .then(logDbError("gantt phase insert"));
      }
    },
    [mutateSchedule, supportsGanttTables, recordChangeEvent],
  );

  const updateGanttPhase = useCallback(
    (projectId: string, phaseId: string, patch: GanttPhaseInput) => {
      let nextEndDate: string | null = null;
      mutateSchedule(projectId, (s) => ({
        ...s,
        phases: s.phases.map((p) => {
          if (p.id !== phaseId) return p;
          const next: ProjectGanttPhase = {
            ...p,
            name: patch.name.trim() || p.name,
            startDate: patch.startDate || p.startDate,
            durationDays: Math.max(
              1,
              Math.round(patch.durationDays) || p.durationDays,
            ),
          };
          if (patch.color !== undefined) {
            if (patch.color) next.color = patch.color;
            else delete next.color;
          }
          if (patch.wbs !== undefined) {
            if (patch.wbs.trim()) next.wbs = patch.wbs.trim();
            else delete next.wbs;
          }
          if (patch.owner !== undefined) {
            if (patch.owner.trim()) next.owner = patch.owner.trim();
            else delete next.owner;
          }
          if (patch.actualStartDate !== undefined) {
            if (patch.actualStartDate) next.actualStartDate = patch.actualStartDate;
            else delete next.actualStartDate;
          }
          if (patch.actualDurationDays !== undefined) {
            if (patch.actualDurationDays != null && patch.actualDurationDays >= 1) {
              next.actualDurationDays = Math.max(
                1,
                Math.round(patch.actualDurationDays),
              );
            } else delete next.actualDurationDays;
          }
          if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
          if (patch.startDate || patch.durationDays !== undefined) {
            nextEndDate = phaseEndDate(next);
          }
          return next;
        }),
      }));
      if (nextEndDate) {
        const due = nextEndDate;
        mutateFinancials(projectId, (f) => ({
          ...f,
          payments: f.payments.map((p) =>
            p.milestoneId === phaseId ? { ...p, dueDate: due } : p,
          ),
          expenseSchedule: (f.expenseSchedule ?? []).map((e) =>
            e.milestoneId === phaseId ? { ...e, dueDate: due } : e,
          ),
        }));
      }
      if (supabase && supportsGanttTables) {
        const row: Record<string, string | number | null> = {};
        if (patch.name !== undefined) row.name = patch.name.trim();
        if (patch.startDate) row.start_date = patch.startDate;
        if (patch.durationDays !== undefined) {
          row.duration_days = Math.max(1, Math.round(patch.durationDays) || 1);
        }
        if (patch.actualStartDate !== undefined) {
          row.actual_start_date = patch.actualStartDate || null;
        }
        if (patch.actualDurationDays !== undefined) {
          row.actual_duration_days =
            patch.actualDurationDays != null && patch.actualDurationDays >= 1
              ? Math.max(1, Math.round(patch.actualDurationDays))
              : null;
        }
        if (patch.color !== undefined) row.color = patch.color || null;
        if (patch.wbs !== undefined) row.wbs = patch.wbs.trim() || null;
        if (patch.owner !== undefined) row.owner = patch.owner.trim() || null;
        if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
        void supabase
          .from("project_gantt_phases")
          .update(row)
          .eq("id", phaseId)
          .then(logDbError("gantt phase update"));
      }
      const project = projectsRef.current.find((p) => p.id === projectId);
      const phaseName =
        patch.name.trim() ||
        project?.schedule?.phases.find((p) => p.id === phaseId)?.name ||
        phaseId;
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_phase",
        entityId: phaseId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated phase ${phaseName}`,
        payloadJson: {
          name: patch.name.trim() || null,
          startDate: patch.startDate || null,
          durationDays: patch.durationDays ?? null,
        },
      });
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const deleteGanttPhase = useCallback(
    (projectId: string, phaseId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const schedule = project?.schedule;
      const phaseName =
        schedule?.phases.find((p) => p.id === phaseId)?.name ?? phaseId;
      const removedIds = new Set<string>([phaseId]);
      for (const a of schedule?.activities ?? []) {
        if (a.phaseId === phaseId) removedIds.add(a.id);
      }
      for (const d of schedule?.deadlines ?? []) {
        if (d.phaseId === phaseId) removedIds.add(d.id);
      }
      mutateSchedule(projectId, (s) => ({
        phases: s.phases.filter((p) => p.id !== phaseId),
        activities: (s.activities ?? []).filter((a) => a.phaseId !== phaseId),
        deadlines: s.deadlines.filter((d) => d.phaseId !== phaseId),
      }));
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.map((p) => {
          if (!p.milestoneId || !removedIds.has(p.milestoneId)) return p;
          const next = { ...p };
          delete next.milestoneId;
          return next;
        }),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (!e.milestoneId || !removedIds.has(e.milestoneId)) return e;
          const next = { ...e };
          delete next.milestoneId;
          return next;
        }),
      }));
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_phase",
        entityId: phaseId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted phase ${phaseName}`,
        payloadJson: { name: phaseName },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_phases")
          .delete()
          .eq("id", phaseId)
          .then(logDbError("gantt phase delete"));
      }
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const addGanttActivity = useCallback(
    (projectId: string, input: GanttActivityInput) => {
      const name = input.name.trim();
      if (!name || !input.phaseId || !input.startDate) return;
      const durationDays = Math.max(1, Math.round(input.durationDays) || 1);
      const project = projectsRef.current.find((p) => p.id === projectId);
      const existing = (project?.schedule?.activities ?? []).filter(
        (a) => a.phaseId === input.phaseId,
      );
      const activity: ProjectGanttActivity = {
        id: crypto.randomUUID(),
        phaseId: input.phaseId,
        name,
        startDate: input.startDate,
        durationDays,
        ...(input.wbs?.trim() ? { wbs: input.wbs.trim() } : {}),
        ...(input.owner?.trim() ? { owner: input.owner.trim() } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.status?.trim() ? { status: input.status.trim() } : {}),
        ...(input.actualStartDate
          ? { actualStartDate: input.actualStartDate }
          : {}),
        ...(input.actualDurationDays != null && input.actualDurationDays >= 1
          ? {
            actualDurationDays: Math.max(
              1,
              Math.round(input.actualDurationDays),
            ),
          }
          : {}),
        sortOrder:
          input.sortOrder ??
          (existing.length > 0
            ? Math.max(...existing.map((a) => a.sortOrder)) + 1
            : 0),
        createdAt: new Date().toISOString(),
      };
      mutateSchedule(projectId, (s) => ({
        ...s,
        activities: [...(s.activities ?? []), activity],
      }));
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_activity",
        entityId: activity.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: added activity ${activity.name}`,
        payloadJson: {
          name: activity.name,
          phaseId: activity.phaseId,
          startDate: activity.startDate,
          durationDays: activity.durationDays,
        },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_activities")
          .insert({
            id: activity.id,
            project_id: projectId,
            phase_id: activity.phaseId,
            name: activity.name,
            start_date: activity.startDate,
            duration_days: activity.durationDays,
            actual_start_date: activity.actualStartDate ?? null,
            actual_duration_days: activity.actualDurationDays ?? null,
            wbs: activity.wbs ?? null,
            owner: activity.owner ?? null,
            color: activity.color ?? null,
            status: activity.status ?? null,
            sort_order: activity.sortOrder,
            created_at: activity.createdAt,
          })
          .then(logDbError("gantt activity insert"));
      }
    },
    [mutateSchedule, supportsGanttTables, recordChangeEvent],
  );

  const updateGanttActivity = useCallback(
    (projectId: string, activityId: string, patch: GanttActivityInput) => {
      let nextEndDate: string | null = null;
      mutateSchedule(projectId, (s) => ({
        ...s,
        activities: (s.activities ?? []).map((a) => {
          if (a.id !== activityId) return a;
          const next: ProjectGanttActivity = {
            ...a,
            phaseId: patch.phaseId || a.phaseId,
            name: patch.name.trim() || a.name,
            startDate: patch.startDate || a.startDate,
            durationDays: Math.max(
              1,
              Math.round(patch.durationDays) || a.durationDays,
            ),
          };
          if (patch.wbs !== undefined) {
            if (patch.wbs.trim()) next.wbs = patch.wbs.trim();
            else delete next.wbs;
          }
          if (patch.owner !== undefined) {
            if (patch.owner.trim()) next.owner = patch.owner.trim();
            else delete next.owner;
          }
          if (patch.color !== undefined) {
            if (patch.color) next.color = patch.color;
            else delete next.color;
          }
          if (patch.status !== undefined) {
            if (patch.status.trim()) next.status = patch.status.trim();
            else delete next.status;
          }
          if (patch.actualStartDate !== undefined) {
            if (patch.actualStartDate) next.actualStartDate = patch.actualStartDate;
            else delete next.actualStartDate;
          }
          if (patch.actualDurationDays !== undefined) {
            if (patch.actualDurationDays != null && patch.actualDurationDays >= 1) {
              next.actualDurationDays = Math.max(
                1,
                Math.round(patch.actualDurationDays),
              );
            } else delete next.actualDurationDays;
          }
          if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
          if (patch.startDate || patch.durationDays !== undefined) {
            nextEndDate = addDays(
              next.startDate,
              Math.max(1, next.durationDays) - 1,
            );
          }
          return next;
        }),
      }));
      if (nextEndDate) {
        const due = nextEndDate;
        mutateFinancials(projectId, (f) => ({
          ...f,
          payments: f.payments.map((p) =>
            p.milestoneId === activityId ? { ...p, dueDate: due } : p,
          ),
          expenseSchedule: (f.expenseSchedule ?? []).map((e) =>
            e.milestoneId === activityId ? { ...e, dueDate: due } : e,
          ),
        }));
      }
      if (supabase && supportsGanttTables) {
        const row: Record<string, string | number | null> = {};
        if (patch.phaseId) row.phase_id = patch.phaseId;
        if (patch.name !== undefined) row.name = patch.name.trim();
        if (patch.startDate) row.start_date = patch.startDate;
        if (patch.durationDays !== undefined) {
          row.duration_days = Math.max(1, Math.round(patch.durationDays) || 1);
        }
        if (patch.actualStartDate !== undefined) {
          row.actual_start_date = patch.actualStartDate || null;
        }
        if (patch.actualDurationDays !== undefined) {
          row.actual_duration_days =
            patch.actualDurationDays != null && patch.actualDurationDays >= 1
              ? Math.max(1, Math.round(patch.actualDurationDays))
              : null;
        }
        if (patch.wbs !== undefined) row.wbs = patch.wbs.trim() || null;
        if (patch.owner !== undefined) row.owner = patch.owner.trim() || null;
        if (patch.color !== undefined) row.color = patch.color || null;
        if (patch.status !== undefined) row.status = patch.status.trim() || null;
        if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
        void supabase
          .from("project_gantt_activities")
          .update(row)
          .eq("id", activityId)
          .then(logDbError("gantt activity update"));
      }
      const project = projectsRef.current.find((p) => p.id === projectId);
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_activity",
        entityId: activityId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated activity ${patch.name.trim() || activityId}`,
        payloadJson: {
          name: patch.name.trim() || null,
          startDate: patch.startDate || null,
          durationDays: patch.durationDays ?? null,
        },
      });
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const deleteGanttActivity = useCallback(
    (projectId: string, activityId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const activityName =
        (project?.schedule?.activities ?? []).find((a) => a.id === activityId)
          ?.name ?? activityId;
      mutateSchedule(projectId, (s) => ({
        ...s,
        activities: (s.activities ?? []).filter((a) => a.id !== activityId),
      }));
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.map((p) => {
          if (p.milestoneId !== activityId) return p;
          const next = { ...p };
          delete next.milestoneId;
          return next;
        }),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (e.milestoneId !== activityId) return e;
          const next = { ...e };
          delete next.milestoneId;
          return next;
        }),
      }));
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_activity",
        entityId: activityId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted activity ${activityName}`,
        payloadJson: { name: activityName },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_activities")
          .delete()
          .eq("id", activityId)
          .then(logDbError("gantt activity delete"));
      }
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const addGanttDeadline = useCallback(
    (projectId: string, input: GanttDeadlineInput) => {
      const name = input.name.trim();
      if (!name || !input.phaseId || !input.date) return;
      const deadline: ProjectGanttDeadline = {
        id: crypto.randomUUID(),
        phaseId: input.phaseId,
        name,
        date: input.date,
        ...(input.wbs?.trim() ? { wbs: input.wbs.trim() } : {}),
        ...(input.owner?.trim() ? { owner: input.owner.trim() } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...(input.actualDate ? { actualDate: input.actualDate } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateSchedule(projectId, (s) => ({
        ...s,
        deadlines: [...s.deadlines, deadline],
      }));
      const project = projectsRef.current.find((p) => p.id === projectId);
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_deadline",
        entityId: deadline.id,
        projectId,
        action: "create",
        summary: `${project?.name ?? projectId}: added deadline ${deadline.name} (${deadline.date})`,
        payloadJson: {
          name: deadline.name,
          date: deadline.date,
          phaseId: deadline.phaseId,
        },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_deadlines")
          .insert({
            id: deadline.id,
            project_id: projectId,
            phase_id: deadline.phaseId,
            name: deadline.name,
            date: deadline.date,
            actual_date: deadline.actualDate ?? null,
            wbs: deadline.wbs ?? null,
            owner: deadline.owner ?? null,
            note: deadline.note ?? null,
            created_at: deadline.createdAt,
          })
          .then(logDbError("gantt deadline insert"));
      }
    },
    [mutateSchedule, supportsGanttTables, recordChangeEvent],
  );

  const updateGanttDeadline = useCallback(
    (projectId: string, deadlineId: string, patch: GanttDeadlineInput) => {
      const nextDate = patch.date;
      mutateSchedule(projectId, (s) => ({
        ...s,
        deadlines: s.deadlines.map((d) => {
          if (d.id !== deadlineId) return d;
          const next: ProjectGanttDeadline = {
            ...d,
            phaseId: patch.phaseId || d.phaseId,
            name: patch.name.trim() || d.name,
            date: patch.date || d.date,
          };
          if (patch.wbs !== undefined) {
            if (patch.wbs.trim()) next.wbs = patch.wbs.trim();
            else delete next.wbs;
          }
          if (patch.owner !== undefined) {
            if (patch.owner.trim()) next.owner = patch.owner.trim();
            else delete next.owner;
          }
          if (patch.note !== undefined) {
            if (patch.note.trim()) next.note = patch.note.trim();
            else delete next.note;
          }
          if (patch.actualDate !== undefined) {
            if (patch.actualDate) next.actualDate = patch.actualDate;
            else delete next.actualDate;
          }
          return next;
        }),
      }));
      // Keep linked income/expense expected dates in sync with the Gantt deadline.
      if (nextDate) {
        mutateFinancials(projectId, (f) => ({
          ...f,
          payments: f.payments.map((p) =>
            p.milestoneId === deadlineId ? { ...p, dueDate: nextDate } : p,
          ),
          expenseSchedule: (f.expenseSchedule ?? []).map((e) =>
            e.milestoneId === deadlineId ? { ...e, dueDate: nextDate } : e,
          ),
        }));
      }
      if (supabase && supportsGanttTables) {
        const row: Record<string, string | null> = {};
        if (patch.phaseId) row.phase_id = patch.phaseId;
        if (patch.name !== undefined) row.name = patch.name.trim();
        if (patch.date) row.date = patch.date;
        if (patch.actualDate !== undefined) {
          row.actual_date = patch.actualDate || null;
        }
        if (patch.wbs !== undefined) row.wbs = patch.wbs.trim() || null;
        if (patch.owner !== undefined) row.owner = patch.owner.trim() || null;
        if (patch.note !== undefined) row.note = patch.note.trim() || null;
        void supabase
          .from("project_gantt_deadlines")
          .update(row)
          .eq("id", deadlineId)
          .then(logDbError("gantt deadline update"));
      }
      const project = projectsRef.current.find((p) => p.id === projectId);
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_deadline",
        entityId: deadlineId,
        projectId,
        action: "update",
        summary: `${project?.name ?? projectId}: updated deadline ${patch.name.trim() || deadlineId}`,
        payloadJson: {
          name: patch.name.trim() || null,
          date: patch.date || null,
        },
      });
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const deleteGanttDeadline = useCallback(
    (projectId: string, deadlineId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      const deadlineName =
        project?.schedule?.deadlines.find((d) => d.id === deadlineId)?.name ??
        deadlineId;
      mutateSchedule(projectId, (s) => ({
        ...s,
        deadlines: s.deadlines.filter((d) => d.id !== deadlineId),
      }));
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.map((p) => {
          if (p.milestoneId !== deadlineId) return p;
          const next = { ...p };
          delete next.milestoneId;
          return next;
        }),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (e.milestoneId !== deadlineId) return e;
          const next = { ...e };
          delete next.milestoneId;
          return next;
        }),
      }));
      recordChangeEvent({
        domain: "gantt",
        entityType: "gantt_deadline",
        entityId: deadlineId,
        projectId,
        action: "delete",
        summary: `${project?.name ?? projectId}: deleted deadline ${deadlineName}`,
        payloadJson: { name: deadlineName },
      });
      if (supabase && supportsGanttTables) {
        void supabase
          .from("project_gantt_deadlines")
          .delete()
          .eq("id", deadlineId)
          .then(logDbError("gantt deadline delete"));
      }
    },
    [mutateSchedule, mutateFinancials, supportsGanttTables, recordChangeEvent],
  );

  const shiftProjectSchedule = useCallback(
    (
      projectId: string,
      opts: {
        amount: number;
        unit: ScheduleShiftUnit;
        includeActuals?: boolean;
      },
    ) => {
      const amount = Math.trunc(opts.amount);
      if (!Number.isFinite(amount) || amount === 0) return;

      const shiftOpts: ScheduleShiftOpts = {
        amount,
        unit: opts.unit,
        includeActuals: Boolean(opts.includeActuals),
      };

      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;

      const nextSchedule = applyScheduleShift(current.schedule, shiftOpts);
      const nextFinancials = shiftProjectFinancials(
        current.financials,
        nextSchedule,
        shiftOpts,
      );

      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, schedule: nextSchedule, financials: nextFinancials }
            : p,
        ),
      );

      if (supabase && supportsGanttTables) {
        const includeActuals = shiftOpts.includeActuals;
        for (const phase of nextSchedule.phases) {
          const row: Record<string, string | null> = {
            start_date: phase.startDate,
          };
          if (includeActuals) {
            row.actual_start_date = phase.actualStartDate ?? null;
          }
          void supabase
            .from("project_gantt_phases")
            .update(row)
            .eq("id", phase.id)
            .then(logDbError("gantt phase shift"));
        }
        for (const activity of nextSchedule.activities ?? []) {
          const row: Record<string, string | null> = {
            start_date: activity.startDate,
          };
          if (includeActuals) {
            row.actual_start_date = activity.actualStartDate ?? null;
          }
          void supabase
            .from("project_gantt_activities")
            .update(row)
            .eq("id", activity.id)
            .then(logDbError("gantt activity shift"));
        }
        for (const deadline of nextSchedule.deadlines) {
          const row: Record<string, string | null> = {
            date: deadline.date,
          };
          if (includeActuals) {
            row.actual_date = deadline.actualDate ?? null;
          }
          void supabase
            .from("project_gantt_deadlines")
            .update(row)
            .eq("id", deadline.id)
            .then(logDbError("gantt deadline shift"));
        }
      }
    },
    [supportsGanttTables],
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (current?.isWarehouseHolding) {
        console.warn("Cannot delete the warehouse holding project");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (current) {
        recordChangeEvent({
          domain: "crm",
          entityType: "project",
          entityId: projectId,
          projectId,
          action: "delete",
          summary: `Deleted project ${current.name}`,
          payloadJson: { name: current.name },
        });
      }
      if (supabase) {
        // Comments are removed by the ON DELETE CASCADE constraint.
        void supabase
          .from("projects")
          .delete()
          .eq("id", projectId)
          .then(logDbError("project delete"));
      }
    },
    [recordChangeEvent],
  );

  const projectNameById = useCallback((id: string) => {
    return projectsRef.current.find((p) => p.id === id)?.name;
  }, []);

  const ensureWarehouseHoldingProject = useCallback((): string => {
    const wh = warehouseRef.current;
    if (wh.holdingProjectId) {
      const existing = projectsRef.current.find(
        (p) => p.id === wh.holdingProjectId,
      );
      if (existing) {
        if (!existing.isWarehouseHolding) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === existing.id ? { ...p, isWarehouseHolding: true } : p,
            ),
          );
        }
        return existing.id;
      }
    }
    const named = projectsRef.current.find(
      (p) =>
        p.isWarehouseHolding ||
        p.name === WAREHOUSE_HOLDING_PROJECT_NAME,
    );
    if (named) {
      setWarehouse((prev) => ({ ...prev, holdingProjectId: named.id }));
      if (!named.isWarehouseHolding) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === named.id ? { ...p, isWarehouseHolding: true } : p,
          ),
        );
      }
      return named.id;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const project: Project = {
      id,
      name: WAREHOUSE_HOLDING_PROJECT_NAME,
      client: "Internal",
      country: "—",
      city: "—",
      series: "Custom",
      market: "Clean H2",
      sizeKw: 1,
      stage: "to-contact",
      isWarehouseHolding: true,
      baseDescription:
        "Internal holding project for spare and buffer warehouse stock. Hidden from the sales board.",
      lastClientContactAt: createdAt.slice(0, 10),
      emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
      emailReminderEnabled: false,
      ...initialMetricsFields({
        stage: "to-contact",
        createdDate: createdAt.slice(0, 10),
      }),
      comments: [],
      todos: [],
      contacts: [],
      files: [],
      financials: emptyFinancials(),
      schedule: emptySchedule(),
      createdAt,
    };
    setProjects((prev) => [project, ...prev]);
    setWarehouse((prev) => ({ ...prev, holdingProjectId: id }));
    const event = recordChangeEvent(
      {
        domain: "warehouse",
        entityType: "holding_project",
        entityId: id,
        projectId: id,
        action: "create",
        summary: `Created ${WAREHOUSE_HOLDING_PROJECT_NAME}`,
      },
      undefined,
      { skipRemote: Boolean(supabase) },
    );
    if (supabase) {
      const insertPromise = supabase
        .from("projects")
        .insert({
          id: project.id,
          name: project.name,
          client: project.client,
          country: project.country,
          city: project.city,
          series: project.series,
          market: project.market,
          size_kw: project.sizeKw,
          stage: project.stage,
          base_description: project.baseDescription,
          ai_summary: null,
          last_client_contact_at: project.lastClientContactAt,
          email_reminder_days: project.emailReminderDays,
          email_reminder_enabled: project.emailReminderEnabled,
          created_at: project.createdAt,
          ...(supportsWarehouseHolding
            ? { is_warehouse_holding: true }
            : {}),
          ...(supportsMetricsFields
            ? {
                cold_lead_entered_at: project.coldLeadEnteredAt,
                last_meaningful_activity_at: project.lastMeaningfulActivityAt,
              }
            : {}),
        })
        .then((res) => {
          logDbError("warehouse holding project insert")(res);
          if (res.error) return false;
          persistChangeEventRemote(event);
          return true;
        });
      projectInsertWaitersRef.current.set(id, Promise.resolve(insertPromise));
    } else {
      projectInsertWaitersRef.current.set(id, Promise.resolve(true));
    }
    return id;
  }, [
    recordChangeEvent,
    persistChangeEventRemote,
    supportsMetricsFields,
    supportsWarehouseHolding,
  ]);

  const upsertWarehouseItem = useCallback(
    (input: {
      id?: string;
      name: string;
      sku?: string;
      unit?: string;
      defaultMaterialKind?: WarehouseMaterialKind;
      groupId?: string | null;
    }): string => {
      const name = input.name.trim();
      if (!name) return input.id ?? "";
      if (input.id) {
        setWarehouse((prev) => ({
          ...prev,
          items: prev.items.map((it) => {
            if (it.id !== input.id) return it;
            const next: WarehouseItem = {
              ...it,
              name,
              unit: input.unit?.trim() || it.unit || "pcs",
              defaultMaterialKind:
                input.defaultMaterialKind ?? it.defaultMaterialKind,
            };
            if (input.sku !== undefined) {
              if (input.sku.trim()) next.sku = input.sku.trim();
              else delete next.sku;
            }
            if (input.groupId !== undefined) {
              if (input.groupId) next.groupId = input.groupId;
              else delete next.groupId;
            }
            return next;
          }),
        }));
        return input.id;
      }
      const id = crypto.randomUUID();
      const item: WarehouseItem = {
        id,
        name,
        ...(input.sku?.trim() ? { sku: input.sku.trim() } : {}),
        unit: input.unit?.trim() || "pcs",
        defaultMaterialKind: input.defaultMaterialKind ?? "materials",
        ...(input.groupId ? { groupId: input.groupId } : {}),
        createdAt: new Date().toISOString(),
      };
      setWarehouse((prev) => ({
        ...prev,
        items: [...prev.items, item],
      }));
      return id;
    },
    [],
  );

  const upsertWarehouseGroup = useCallback(
    (input: {
      id?: string;
      name: string;
      parentId?: string | null;
    }): { ok: true; id: string } | { ok: false; error: string } => {
      const name = input.name.trim();
      if (!name) return { ok: false, error: "Enter a group name" };

      if (input.id) {
        const existing = warehouseRef.current.groups.find(
          (g) => g.id === input.id,
        );
        if (!existing) return { ok: false, error: "Group not found" };
        if (input.parentId) {
          const parent = warehouseRef.current.groups.find(
            (g) => g.id === input.parentId,
          );
          if (!parent || parent.id === input.id || parent.parentId) {
            return { ok: false, error: "Invalid parent group" };
          }
          const hasChildren = warehouseRef.current.groups.some(
            (g) => g.parentId === input.id,
          );
          if (hasChildren) {
            return {
              ok: false,
              error: "Move or remove subgroups before nesting this group",
            };
          }
        }
        setWarehouse((prev) => ({
          ...prev,
          groups: prev.groups.map((g) => {
            if (g.id !== input.id) return g;
            const next: WarehouseGroup = { ...g, name };
            if (input.parentId !== undefined) {
              if (input.parentId) next.parentId = input.parentId;
              else delete next.parentId;
            }
            return next;
          }),
        }));
        return { ok: true, id: input.id };
      }

      if (input.parentId) {
        const parent = warehouseRef.current.groups.find(
          (g) => g.id === input.parentId,
        );
        if (!parent || parent.parentId) {
          return { ok: false, error: "Parent group not found" };
        }
      }

      const id = crypto.randomUUID();
      const group: WarehouseGroup = {
        id,
        name,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        createdAt: new Date().toISOString(),
      };
      setWarehouse((prev) => ({
        ...prev,
        groups: [...prev.groups, group],
      }));
      return { ok: true, id };
    },
    [],
  );

  const deleteWarehouseGroup = useCallback(
    (groupId: string): { ok: true } | { ok: false; error: string } => {
      const existing = warehouseRef.current.groups.find((g) => g.id === groupId);
      if (!existing) return { ok: false, error: "Group not found" };
      setWarehouse((prev) => ({
        ...prev,
        groups: prev.groups
          .filter((g) => g.id !== groupId)
          .map((g) => {
            if (g.parentId !== groupId) return g;
            const next = { ...g };
            delete next.parentId;
            return next;
          }),
        items: prev.items.map((it) => {
          if (it.groupId !== groupId) return it;
          const next = { ...it };
          delete next.groupId;
          return next;
        }),
      }));
      return { ok: true };
    },
    [],
  );

  const importMoneyWorksWarehouse = useCallback(async (): Promise<
    | {
        ok: true;
        stats: {
          groups: number;
          items: number;
          lots: number;
          balances: number;
          serials: number;
          boms: number;
          bomLines: number;
          parkedSystem: number;
        };
      }
    | { ok: false; error: string }
  > => {
    const holdingId = ensureWarehouseHoldingProject();
    const holdingReady =
      projectInsertWaitersRef.current.get(holdingId) ?? Promise.resolve(true);
    try {
      await holdingReady;
      const res = await fetch("/api/warehouse/moneyworks-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdingProjectId: holdingId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        stats?: {
          groups: number;
          items: number;
          lots: number;
          balances: number;
          serials: number;
          boms: number;
          bomLines: number;
          parkedSystem: number;
        };
        warehouse?: Omit<WarehouseState, "holdingProjectId">;
      };
      if (!res.ok || !data.ok || !data.warehouse || !data.stats) {
        return { ok: false, error: data.error || "Import failed" };
      }
      setWarehouse((prev) => {
        const mergedBoms = mergeBomsAfterImport(prev, {
          boms: data.warehouse!.boms ?? [],
          bomLines: data.warehouse!.bomLines ?? [],
        });
        return {
          ...data.warehouse!,
          holdingProjectId: prev.holdingProjectId ?? holdingId,
          movements: data.warehouse!.movements ?? [],
          boms: mergedBoms.boms,
          bomLines: mergedBoms.bomLines,
        };
      });
      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: "moneyworks-import",
        projectId: holdingId,
        action: "create",
        summary: `Imported MoneyWorks stock: ${data.stats.balances} balances, ${data.stats.items} items, ${data.stats.serials} serials, ${data.stats.boms} BOMs (${data.stats.parkedSystem} System-* parked in ELX/Buffer)`,
        payloadJson: data.stats,
      });
      return { ok: true, stats: data.stats };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [ensureWarehouseHoldingProject, recordChangeEvent]);

  /** Move proportional materials expense with stock between projects. */
  const moveLotExpenseCost = useCallback(
    (
      lot: WarehouseLot,
      fromProjectId: string,
      toProjectId: string,
      qty: number,
    ) => {
      if (fromProjectId === toProjectId || qty <= 0) return;
      const amountInc = roundMoney(qty * lot.unitCostIncVat);
      const amountEx = roundMoney(qty * lot.unitCostExVat);
      if (amountInc <= 0) return;

      const fromProj = projectsRef.current.find((p) => p.id === fromProjectId);
      const toProj = projectsRef.current.find((p) => p.id === toProjectId);
      if (!fromProj || !toProj) return;

      const fromExp = (fromProj.financials.expenseSchedule ?? []).find(
        (e) => e.warehouseLotId === lot.id,
      );
      const toExp = (toProj.financials.expenseSchedule ?? []).find(
        (e) => e.warehouseLotId === lot.id,
      );

      const moveAmount = fromExp
        ? Math.min(amountInc, fromExp.amount)
        : amountInc;
      const moveEx = fromExp?.amountExVat != null
        ? roundMoney(
            Math.min(
              amountEx,
              (fromExp.amountExVat / Math.max(fromExp.amount, 0.01)) *
                moveAmount,
            ),
          )
        : amountEx;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === fromProjectId) {
            const schedule = [...(p.financials.expenseSchedule ?? [])];
            const idx = schedule.findIndex((e) => e.warehouseLotId === lot.id);
            if (idx >= 0) {
              const e = schedule[idx];
              const nextAmt = roundMoney(e.amount - moveAmount);
              if (nextAmt <= 0.009) {
                schedule.splice(idx, 1);
              } else {
                const next: ProjectExpenseItem = {
                  ...e,
                  amount: nextAmt,
                };
                if (e.amountExVat != null) {
                  next.amountExVat = roundMoney(
                    Math.max(0, e.amountExVat - moveEx),
                  );
                }
                schedule[idx] = next;
              }
            }
            return {
              ...p,
              financials: { ...p.financials, expenseSchedule: schedule },
            };
          }
          if (p.id === toProjectId) {
            const schedule = [...(p.financials.expenseSchedule ?? [])];
            const idx = schedule.findIndex((e) => e.warehouseLotId === lot.id);
            if (idx >= 0) {
              const e = schedule[idx];
              const next: ProjectExpenseItem = {
                ...e,
                amount: roundMoney(e.amount + moveAmount),
              };
              if (e.amountExVat != null || moveEx > 0) {
                next.amountExVat = roundMoney((e.amountExVat ?? 0) + moveEx);
              }
              schedule[idx] = next;
            } else {
              const template = fromExp;
              const created: ProjectExpenseItem = {
                id: crypto.randomUUID(),
                amount: moveAmount,
                ...(moveEx > 0 ? { amountExVat: moveEx } : {}),
                dueDate: template?.dueDate ?? lot.receivedAt,
                ...(template?.actualDate
                  ? { actualDate: template.actualDate }
                  : lot.receivedAt
                    ? { actualDate: lot.receivedAt }
                    : {}),
                label:
                  template?.label ??
                  lot.label ??
                  `Warehouse lot ${lot.id.slice(0, 8)}`,
                category: template?.category ?? lot.category,
                ...(template?.subcategory || lot.subcategory
                  ? {
                      subcategory:
                        template?.subcategory ?? lot.subcategory,
                    }
                  : {}),
                warehouseLotId: lot.id,
                createdAt: new Date().toISOString(),
              };
              schedule.push(created);
            }
            return {
              ...p,
              financials: { ...p.financials, expenseSchedule: schedule },
            };
          }
          return p;
        }),
      );

      const fromName = fromProj.name;
      const toName = toProj.name;
      const summary = `Moved materials cost ${formatValue(moveAmount)} from ${fromName} to ${toName} (lot stock transfer)`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "finance_meta",
          entityType: "expense",
          entityId: lot.id,
          projectId: toProjectId,
          action: "transfer",
          field: "amount",
          summary,
          payloadJson: {
            field: "warehouse_cost_transfer",
            fromProjectId,
            toProjectId,
            lotId: lot.id,
          },
        },
        {
          projectId: toProjectId,
          projectName: toName,
          entityType: "expense",
          entityId: lot.id,
          action: "transfer",
          field: "amount",
          oldValue: `${fromName}: ${formatValue(fromExp?.amount ?? 0)}`,
          newValue: formatValue(moveAmount),
          summary,
        },
      );
    },
    [recordChangeEvent],
  );

  /** Align predicted expenses with WH draws: bump if overspent; snap on due date. */
  const reconcileBudgetExpenses = useCallback(
    (expenseIds?: string[]) => {
      const lots = warehouseRef.current.lots;
      const today = todayDate();
      const changes: {
        projectId: string;
        projectName: string;
        expenseId: string;
        oldAmount: number;
        newAmount: number;
        settled: boolean;
      }[] = [];

      setProjects(() => {
        const base = projectsRef.current;
        const nextProjects = base.map((p) => {
          let changed = false;
          const schedule = (p.financials.expenseSchedule ?? []).map((e) => {
            if (expenseIds && !expenseIds.includes(e.id)) return e;
            if (e.warehouseLotId) return e;

            const spent = spentAgainstExpense(lots, e.id);
            const spentEx = spentAgainstExpenseEx(lots, e.id);
            const dueReached = today >= e.dueDate;
            const alreadyPaid = Boolean(e.actualDate);

            let nextAmount = e.amount;
            let nextEx = e.amountExVat;
            let nextActual = e.actualDate;
            let settled = false;

            if (alreadyPaid) {
              // Marked paid (manually or previously) — keep amount aligned with WH draws
              if (spent > 0 && Math.abs(spent - e.amount) > 0.009) {
                nextAmount = spent;
                nextEx = spentEx > 0 ? spentEx : undefined;
                settled = true;
              } else if (
                spent > 0 &&
                !(e.budgetAmount != null && e.budgetAmount > 0)
              ) {
                // Recover original prediction from history when already settled
                let best = 0;
                for (const h of financialHistoryRef.current) {
                  if (
                    h.entityType !== "expense" ||
                    h.entityId !== e.id ||
                    h.field !== "amount" ||
                    !h.oldValue
                  ) {
                    continue;
                  }
                  const parsed = Number(
                    String(h.oldValue).replace(/[^0-9.-]/g, ""),
                  );
                  if (Number.isFinite(parsed) && parsed > best) best = parsed;
                }
                if (best > 0 && Math.abs(best - e.amount) > 0.01) {
                  changed = true;
                  return { ...e, budgetAmount: roundMoney(best) };
                }
                return e;
              } else {
                return e;
              }
            } else {
              if (spent > e.amount + 0.009) {
                nextAmount = spent;
                nextEx = spentEx > 0 ? spentEx : undefined;
              }
              if (dueReached && spent > 0) {
                nextAmount = spent;
                nextEx = spentEx > 0 ? spentEx : undefined;
                nextActual = e.dueDate;
                settled = true;
              } else if (dueReached && spent <= 0) {
                return e;
              }
            }

            if (
              Math.abs(nextAmount - e.amount) < 0.01 &&
              nextActual === e.actualDate
            ) {
              return e;
            }

            changed = true;
            changes.push({
              projectId: p.id,
              projectName: p.name,
              expenseId: e.id,
              oldAmount: e.amount,
              newAmount: nextAmount,
              settled,
            });
            const next: ProjectExpenseItem = {
              ...e,
              amount: roundMoney(nextAmount),
            };
            const kept = preserveBudgetAmount(e, nextAmount);
            if (kept != null) next.budgetAmount = kept;
            if (nextEx != null && nextEx > 0) {
              next.amountExVat = roundMoney(nextEx);
            } else if (nextAmount > 0) {
              next.amountExVat = amountExFromInc(nextAmount);
            }
            if (nextActual) next.actualDate = nextActual;
            return next;
          });
          if (!changed) return p;
          return {
            ...p,
            financials: { ...p.financials, expenseSchedule: schedule },
          };
        });
        projectsRef.current = nextProjects;
        return nextProjects;
      });

      for (const c of changes) {
        const summary = c.settled
          ? `${c.projectName}: settled predicted expense to WH spent ${formatValue(c.newAmount)}`
          : `${c.projectName}: raised predicted expense to WH spent ${formatValue(c.newAmount)}`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "expense",
            entityId: c.expenseId,
            projectId: c.projectId,
            action: "update",
            field: "amount",
            summary,
            payloadJson: {
              field: "amount",
              reason: c.settled ? "budget_settle" : "budget_overspend",
            },
          },
          {
            projectId: c.projectId,
            projectName: c.projectName,
            entityType: "expense",
            entityId: c.expenseId,
            action: "update",
            field: "amount",
            oldValue: formatValue(c.oldAmount),
            newValue: formatValue(c.newAmount),
            summary,
          },
        );
      }
    },
    [recordChangeEvent],
  );

  const linkProjectWarehouseExpenses = useCallback(():
    | {
        ok: true;
        linkedLots: number;
        createdExpenses: string[];
        projectCount: number;
      }
    | { ok: false; error: string } => {
    const linked = linkProjectSlotLotsToMaterialsExpenses(
      projectsRef.current,
      warehouseRef.current,
    );
    if (linked.projectCount === 0 && linked.linkedLots === 0) {
      return {
        ok: false,
        error: "No project-slot stock found to link.",
      };
    }
    setWarehouse(linked.state);
    warehouseRef.current = linked.state;
    setProjects(linked.projects);
    projectsRef.current = linked.projects;
    reconcileBudgetExpenses();
    recordChangeEvent({
      domain: "warehouse",
      entityType: "expense_link",
      entityId: "project-materials",
      action: "update",
      summary: `Linked ${linked.linkedLots} WH lots to manufacture-materials expenses (${linked.projectCount} projects)`,
      payloadJson: {
        linkedLots: linked.linkedLots,
        createdExpenses: linked.createdExpenseProjectNames,
        projectCount: linked.projectCount,
      },
    });
    return {
      ok: true,
      linkedLots: linked.linkedLots,
      createdExpenses: linked.createdExpenseProjectNames,
      projectCount: linked.projectCount,
    };
  }, [recordChangeEvent, reconcileBudgetExpenses]);

  const saveWarehouseBom = useCallback(
    (
      input: WarehouseBomSaveInput,
    ): { ok: true; bomId: string } | { ok: false; error: string } => {
      const wh = warehouseRef.current;
      const existing = input.id
        ? (wh.boms.find((b) => b.id === input.id) ?? null)
        : null;
      if (input.id && !existing) {
        return { ok: false, error: "Recipe not found" };
      }
      const catalogIds = new Set(wh.items.map((i) => i.id));
      const built = buildSavedBom(input, existing, catalogIds);
      if (!built.ok) return built;

      setWarehouse((prev) => ({
        ...prev,
        boms: existing
          ? prev.boms.map((b) => (b.id === built.bom.id ? built.bom : b))
          : [...prev.boms, built.bom],
        bomLines: [
          ...prev.bomLines.filter((l) => l.bomId !== built.bom.id),
          ...built.lines,
        ],
      }));
      recordChangeEvent({
        domain: "warehouse",
        entityType: "bom",
        entityId: built.bom.id,
        action: existing ? "update" : "create",
        summary: existing
          ? `Updated BOM recipe “${built.bom.name}” (${built.lines.length} parts)`
          : `Created BOM recipe “${built.bom.name}” (${built.lines.length} parts)`,
        payloadJson: {
          name: built.bom.name,
          lineCount: built.lines.length,
          sourceKey: built.bom.sourceKey,
        },
      });
      return { ok: true, bomId: built.bom.id };
    },
    [recordChangeEvent],
  );

  const duplicateWarehouseBom = useCallback(
    (
      bomId: string,
    ): { ok: true; bomId: string } | { ok: false; error: string } => {
      const wh = warehouseRef.current;
      const src = wh.boms.find((b) => b.id === bomId);
      if (!src) return { ok: false, error: "Recipe not found" };
      const lines = wh.bomLines
        .filter((l) => l.bomId === bomId)
        .slice()
        .sort((a, b) => a.position - b.position);
      return saveWarehouseBom({
        name: `${src.name} (copy)`,
        ...(src.outputGroup ? { outputGroup: src.outputGroup } : {}),
        ...(src.productFamily ? { productFamily: src.productFamily } : {}),
        ...(src.outputItemId ? { outputItemId: src.outputItemId } : {}),
        qtyProduced: 0,
        ...(src.notes ? { notes: src.notes } : {}),
        lines: lines.map((l) => ({
          componentName: l.componentName,
          ...(l.componentGroup ? { componentGroup: l.componentGroup } : {}),
          ...(l.componentItemId ? { componentItemId: l.componentItemId } : {}),
          qtyPerUnit: l.qtyPerUnit,
          ...(l.unitCost != null ? { unitCost: l.unitCost } : {}),
        })),
      });
    },
    [saveWarehouseBom],
  );

  const deleteWarehouseBom = useCallback(
    (bomId: string): { ok: true } | { ok: false; error: string } => {
      const wh = warehouseRef.current;
      const src = wh.boms.find((b) => b.id === bomId);
      if (!src) return { ok: false, error: "Recipe not found" };
      setWarehouse((prev) => ({
        ...prev,
        boms: prev.boms.filter((b) => b.id !== bomId),
        bomLines: prev.bomLines.filter((l) => l.bomId !== bomId),
      }));
      recordChangeEvent({
        domain: "warehouse",
        entityType: "bom",
        entityId: bomId,
        action: "delete",
        summary: `Deleted BOM recipe “${src.name}”`,
        payloadJson: { name: src.name, sourceKey: src.sourceKey },
      });
      return { ok: true };
    },
    [recordChangeEvent],
  );

  const applySystemSkladMapping = useCallback(async (): Promise<
    | {
        ok: true;
        createdProjects: string[];
        movedBalances: number;
        movedSerials: number;
        maps: number;
        unmatched: string[];
        linkedLots: number;
        createdExpenses: string[];
      }
    | { ok: false; error: string }
  > => {
    const createdProjects: string[] = [];
    const createdLookup: { id: string; name: string }[] = [];
    for (const seed of SYSTEM_SKLAD_PROJECT_SEEDS) {
      const exists = projectsRef.current.some(
        (p) => p.name.toLowerCase() === seed.name.toLowerCase(),
      );
      if (exists) continue;
      const id = addProject({
        name: seed.name,
        client: seed.client,
        country: seed.country,
        city: seed.city,
        series: seed.series,
        market: seed.market,
        sizeKw: seed.sizeKw,
        stage: "under-development",
        baseDescription: seed.baseDescription,
      });
      createdProjects.push(seed.name);
      createdLookup.push({ id, name: seed.name });
      const ready =
        projectInsertWaitersRef.current.get(id) ?? Promise.resolve(true);
      const ok = await ready;
      if (!ok) {
        return {
          ok: false,
          error: `Failed to create project "${seed.name}" in database before mapping.`,
        };
      }
    }

    const maps = buildDefaultSkladMaps([
      ...projectsRef.current,
      ...createdLookup,
    ]);
    if (maps.length === 0) {
      return {
        ok: false,
        error:
          "No System-* → project maps resolved. Create/match projects first.",
      };
    }

    const result = applySkladMapsToWarehouseState(
      warehouseRef.current,
      maps,
    );

    // Newly created seeds may not be in projectsRef until next render.
    const projectById = new Map(
      projectsRef.current.map((p) => [p.id, p] as const),
    );
    for (const seed of SYSTEM_SKLAD_PROJECT_SEEDS) {
      const created = createdLookup.find((c) => c.name === seed.name);
      if (!created || projectById.has(created.id)) continue;
      const createdAt = new Date().toISOString();
      projectById.set(created.id, {
        id: created.id,
        name: seed.name,
        client: seed.client,
        country: seed.country,
        city: seed.city,
        series: seed.series,
        market: seed.market,
        sizeKw: seed.sizeKw,
        stage: "under-development",
        baseDescription: seed.baseDescription,
        lastClientContactAt: createdAt.slice(0, 10),
        emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
        emailReminderEnabled: true,
        ...initialMetricsFields({
          stage: "under-development",
          createdDate: createdAt.slice(0, 10),
        }),
        comments: [],
        todos: [],
        contacts: [],
        files: [],
        financials: emptyFinancials(),
        schedule: emptySchedule(),
        createdAt,
      });
    }

    const linked = linkProjectSlotLotsToMaterialsExpenses(
      [...projectById.values()],
      result.state,
    );

    setWarehouse(linked.state);
    warehouseRef.current = linked.state;
    setProjects(linked.projects);
    projectsRef.current = linked.projects;

    await persistRemoteSkladMaps(maps);
    reconcileBudgetExpenses();

    recordChangeEvent({
      domain: "warehouse",
      entityType: "sklad_map",
      entityId: "system-map",
      action: "update",
      summary: `Mapped System-* stock to projects: ${result.movedBalances} balances, ${result.movedSerials} serials (${maps.length} maps); linked ${linked.linkedLots} lots to materials expenses`,
      payloadJson: {
        maps: maps.map((m) => ({
          sourceSklad: m.sourceSklad,
          projectId: m.projectId,
        })),
        createdProjects,
        unmatched: result.unmatched,
        linkedLots: linked.linkedLots,
        createdExpenses: linked.createdExpenseProjectNames,
      },
    });

    return {
      ok: true,
      createdProjects,
      movedBalances: result.movedBalances,
      movedSerials: result.movedSerials,
      maps: maps.length,
      unmatched: result.unmatched,
      linkedLots: linked.linkedLots,
      createdExpenses: linked.createdExpenseProjectNames,
    };
  }, [addProject, recordChangeEvent, reconcileBudgetExpenses]);

  const receiveStock = useCallback(
    (
      input: WarehouseReceiveInput,
    ): { ok: true; lotId: string } | { ok: false; error: string } => {
      if (!(input.qty > 0) || !Number.isFinite(input.qty)) {
        return { ok: false, error: "Quantity must be positive" };
      }
      if (!(input.unitCostIncVat >= 0) || !Number.isFinite(input.unitCostIncVat)) {
        return { ok: false, error: "Unit cost is invalid" };
      }
      if (
        input.destination.slot === "project" &&
        !input.destination.projectId
      ) {
        return { ok: false, error: "Select a destination project" };
      }

      let itemId = input.itemId;
      if (!itemId) {
        if (!input.newItem?.name?.trim()) {
          return { ok: false, error: "Item name is required" };
        }
        itemId = upsertWarehouseItem({
          name: input.newItem.name,
          sku: input.newItem.sku,
          unit: input.newItem.unit,
          defaultMaterialKind:
            input.newItem.defaultMaterialKind ?? input.materialKind,
          groupId: input.newItem.groupId ?? input.groupId ?? null,
        });
      } else if (input.groupId !== undefined) {
        const existing = warehouseRef.current.items.find((i) => i.id === itemId);
        if (existing) {
          upsertWarehouseItem({
            id: itemId,
            name: existing.name,
            sku: existing.sku,
            unit: existing.unit,
            defaultMaterialKind: existing.defaultMaterialKind,
            groupId: input.groupId,
          });
        }
      }

      const holdingId = ensureWarehouseHoldingProject();
      const expenseProjectId = expenseProjectIdForLocation(
        input.destination,
        holdingId,
      );
      const { category, subcategory } = materialKindToExpense(
        input.materialKind,
      );
      const unitEx = unitCostExFromInc(
        input.unitCostIncVat,
        input.unitCostExVat,
      );
      const totalInc = roundMoney(input.qty * input.unitCostIncVat);
      const totalEx = roundMoney(input.qty * unitEx);
      const lotId = crypto.randomUUID();
      const existingItem = warehouseRef.current.items.find((i) => i.id === itemId);
      const label =
        input.label?.trim() ||
        input.newItem?.name?.trim() ||
        existingItem?.name ||
        "Warehouse receipt";

      let expenseId = "";
      if (input.expenseMode === "link") {
        const link = input.linkExpense;
        if (!link?.expenseId || !link.projectId) {
          return { ok: false, error: "Select an expense to link" };
        }
        if (link.projectId !== expenseProjectId) {
          return {
            ok: false,
            error:
              "Linked expense must be on the same project as the stock destination (use holding project for spares/buffer)",
          };
        }
        const proj = projectsRef.current.find((p) => p.id === link.projectId);
        const exp = (proj?.financials.expenseSchedule ?? []).find(
          (e) => e.id === link.expenseId,
        );
        if (!exp) return { ok: false, error: "Linked expense not found" };
        // Dedicated 1:1 WH cash lines cannot take a second lot
        if (exp.warehouseLotId) {
          return {
            ok: false,
            error:
              "That expense is already a dedicated warehouse cash line. Link draws to a predicted (unpaid) budget expense instead, or create a new expense.",
          };
        }
        if (exp.actualDate) {
          return {
            ok: false,
            error:
              "That expense is already paid. Link warehouse draws to an unpaid predicted budget expense, or create a new expense.",
          };
        }
        expenseId = exp.id;
        // Budget envelope: attach lot only — do not overwrite predicted amount
        // or invent actualDate. reconcileBudgetExpenses may bump if overspent.
        const summary = `${proj?.name ?? link.projectId}: linked warehouse lot to predicted expense ${exp.label ?? exp.id} (+${formatValue(totalInc)})`;
        recordChangeEvent({
          domain: "warehouse",
          entityType: "lot",
          entityId: lotId,
          projectId: link.projectId,
          action: "link",
          summary,
          payloadJson: {
            expenseId,
            budget: isBudgetEnvelopeExpense(exp),
          },
        });
      } else {
        expenseId = crypto.randomUUID();
        const expense: ProjectExpenseItem = {
          id: expenseId,
          amount: totalInc,
          amountExVat: totalEx,
          dueDate: input.receivedAt,
          actualDate: input.actualDate ?? input.receivedAt,
          label,
          category,
          ...(subcategory ? { subcategory } : {}),
          warehouseLotId: lotId,
          createdAt: new Date().toISOString(),
        };
        setProjects((prev) =>
          prev.map((p) =>
            p.id === expenseProjectId
              ? {
                  ...p,
                  financials: {
                    ...p.financials,
                    expenseSchedule: [
                      ...(p.financials.expenseSchedule ?? []),
                      expense,
                    ],
                  },
                }
              : p,
          ),
        );
        const projectName =
          projectsRef.current.find((p) => p.id === expenseProjectId)?.name ??
          expenseProjectId;
        const summary = `${projectName}: added expense ${label} (${formatValue(totalInc)})`;
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "expense",
            entityId: expenseId,
            projectId: expenseProjectId,
            action: "create",
            summary,
            payloadJson: { category, lotId },
          },
          {
            projectId: expenseProjectId,
            projectName,
            entityType: "expense",
            entityId: expenseId,
            action: "create",
            newValue: formatValue(totalInc),
            summary,
          },
        );
      }

      const lot: WarehouseLot = {
        id: lotId,
        itemId: itemId!,
        qtyReceived: input.qty,
        unitCostIncVat: input.unitCostIncVat,
        unitCostExVat: unitEx,
        receivedAt: input.receivedAt,
        purchaseProjectId: expenseProjectId,
        expenseId,
        category,
        ...(subcategory ? { subcategory } : {}),
        ...(input.supplier?.trim() ? { supplier: input.supplier.trim() } : {}),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        label,
        createdAt: new Date().toISOString(),
      };
      const destLoc: WarehouseLocation = cloneLocation(input.destination);
      const balance: WarehouseBalance = {
        id: crypto.randomUUID(),
        lotId,
        location: destLoc,
        qty: input.qty,
      };
      const movement: WarehouseMovement = {
        id: crypto.randomUUID(),
        lotId,
        action: "receive",
        qty: input.qty,
        to: destLoc,
        occurredAt: new Date().toISOString(),
        ...(input.notes?.trim() ? { note: input.notes.trim() } : {}),
      };

      setWarehouse((prev) => ({
        ...prev,
        lots: [...prev.lots, lot],
        balances: [...prev.balances, balance],
        movements: [movement, ...prev.movements],
      }));

      const toLabel = locationLabel(destLoc, projectNameById);
      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: lotId,
        projectId:
          destLoc.slot === "project" ? destLoc.projectId : holdingId,
        action: "receive",
        summary: movementSummary("receive", input.qty, undefined, toLabel),
        payloadJson: {
          itemId,
          qty: input.qty,
          site: destLoc.site,
          slot: destLoc.slot,
          ...(destLoc.projectId ? { projectId: destLoc.projectId } : {}),
        },
      });

      // Lot is in warehouseRef only after setState — merge for reconcile
      warehouseRef.current = {
        ...warehouseRef.current,
        lots: [
          ...warehouseRef.current.lots.filter((l) => l.id !== lotId),
          lot,
        ],
        balances: [
          ...warehouseRef.current.balances.filter((b) => b.lotId !== lotId),
          balance,
        ],
      };
      reconcileBudgetExpenses([expenseId]);

      return { ok: true, lotId };
    },
    [
      ensureWarehouseHoldingProject,
      upsertWarehouseItem,
      recordChangeEvent,
      projectNameById,
      reconcileBudgetExpenses,
    ],
  );

  const transferStock = useCallback(
    (
      input: WarehouseTransferInput,
    ): { ok: true } | { ok: false; error: string } => {
      if (!(input.qty > 0)) return { ok: false, error: "Quantity must be positive" };
      if (locationsEqual(input.from, input.to)) {
        return { ok: false, error: "Source and destination are the same" };
      }
      if (input.to.slot === "project" && !input.to.projectId) {
        return { ok: false, error: "Select a destination project" };
      }
      if (input.from.slot === "project" && !input.from.projectId) {
        return { ok: false, error: "Invalid source location" };
      }

      const wh = warehouseRef.current;
      const lot = wh.lots.find((l) => l.id === input.lotId);
      if (!lot) return { ok: false, error: "Lot not found" };
      const bal = findBalance(wh.balances, input.lotId, input.from);
      if (!bal || bal.qty + 1e-9 < input.qty) {
        return { ok: false, error: "Insufficient quantity at source" };
      }

      const holdingId = ensureWarehouseHoldingProject();
      const fromExpenseProject = expenseProjectIdForLocation(
        input.from,
        holdingId,
      );
      const toExpenseProject = expenseProjectIdForLocation(input.to, holdingId);

      setWarehouse((prev) => {
        let balances = applyBalanceDelta(
          prev.balances,
          input.lotId,
          input.from,
          -input.qty,
        );
        balances = applyBalanceDelta(balances, input.lotId, input.to, input.qty);
        const movement: WarehouseMovement = {
          id: crypto.randomUUID(),
          lotId: input.lotId,
          action: "transfer",
          qty: input.qty,
          from: input.from,
          to: input.to,
          occurredAt: new Date().toISOString(),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        };
        return {
          ...prev,
          balances,
          movements: [movement, ...prev.movements],
        };
      });

      moveLotExpenseCost(
        lot,
        fromExpenseProject,
        toExpenseProject,
        input.qty,
      );

      const fromLabel = locationLabel(input.from, projectNameById);
      const toLabel = locationLabel(input.to, projectNameById);
      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: input.lotId,
        projectId:
          input.to.slot === "project" ? input.to.projectId : holdingId,
        action: "transfer",
        summary: movementSummary("transfer", input.qty, fromLabel, toLabel),
        payloadJson: {
          qty: input.qty,
          fromSite: input.from.site,
          fromSlot: input.from.slot,
          toSite: input.to.site,
          toSlot: input.to.slot,
          ...(input.from.projectId ? { fromProjectId: input.from.projectId } : {}),
          ...(input.to.projectId ? { toProjectId: input.to.projectId } : {}),
        },
      });

      return { ok: true };
    },
    [
      ensureWarehouseHoldingProject,
      moveLotExpenseCost,
      recordChangeEvent,
      projectNameById,
    ],
  );

  const consumeStock = useCallback(
    (
      input: WarehouseConsumeInput,
    ): { ok: true } | { ok: false; error: string } => {
      if (!(input.qty > 0)) return { ok: false, error: "Quantity must be positive" };
      if (input.from.slot === "project" && !input.from.projectId) {
        return { ok: false, error: "Invalid location" };
      }
      const wh = warehouseRef.current;
      const lot = wh.lots.find((l) => l.id === input.lotId);
      if (!lot) return { ok: false, error: "Lot not found" };
      const bal = findBalance(wh.balances, input.lotId, input.from);
      if (!bal || bal.qty + 1e-9 < input.qty) {
        return { ok: false, error: "Insufficient quantity" };
      }

      setWarehouse((prev) => {
        const balances = applyBalanceDelta(
          prev.balances,
          input.lotId,
          input.from,
          -input.qty,
        );
        const movement: WarehouseMovement = {
          id: crypto.randomUUID(),
          lotId: input.lotId,
          action: "consume",
          qty: input.qty,
          from: input.from,
          occurredAt: new Date().toISOString(),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        };
        return {
          ...prev,
          balances,
          movements: [movement, ...prev.movements],
        };
      });

      const fromLabel = locationLabel(input.from, projectNameById);
      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: input.lotId,
        projectId:
          input.from.slot === "project"
            ? input.from.projectId
            : warehouseRef.current.holdingProjectId ?? undefined,
        action: "consume",
        summary: movementSummary("consume", input.qty, fromLabel),
        payloadJson: {
          qty: input.qty,
          site: input.from.site,
          slot: input.from.slot,
          ...(input.from.projectId ? { projectId: input.from.projectId } : {}),
        },
      });

      return { ok: true };
    },
    [recordChangeEvent, projectNameById],
  );

  const adjustStock = useCallback(
    (
      input: WarehouseAdjustInput,
    ): { ok: true } | { ok: false; error: string } => {
      if (!(input.newQty >= 0) || !Number.isFinite(input.newQty)) {
        return { ok: false, error: "Quantity must be zero or positive" };
      }
      const wh = warehouseRef.current;
      const lot = wh.lots.find((l) => l.id === input.lotId);
      if (!lot) return { ok: false, error: "Lot not found" };
      const bal = findBalance(wh.balances, input.lotId, input.location);
      const currentQty = bal?.qty ?? 0;
      const delta = roundMoney(input.newQty - currentQty);
      if (Math.abs(delta) < 1e-9) return { ok: true };

      // Adjustments that reduce stock without consume do not move expense
      // (inventory write-off stays on current project's books).
      setWarehouse((prev) => {
        const balances = applyBalanceDelta(
          prev.balances,
          input.lotId,
          input.location,
          delta,
        );
        const movement: WarehouseMovement = {
          id: crypto.randomUUID(),
          lotId: input.lotId,
          action: "adjust",
          qty: Math.abs(delta),
          from: input.location,
          to: input.location,
          occurredAt: new Date().toISOString(),
          note:
            input.note?.trim() ||
            `Set qty ${currentQty} → ${input.newQty}`,
        };
        return {
          ...prev,
          balances,
          movements: [movement, ...prev.movements],
        };
      });

      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: input.lotId,
        action: "adjust",
        summary: `Adjusted stock at ${locationLabel(input.location, projectNameById)}: ${currentQty} → ${input.newQty}`,
        payloadJson: {
          fromQty: currentQty,
          toQty: input.newQty,
          location: `${input.location.site}/${input.location.slot}`,
        },
      });

      return { ok: true };
    },
    [recordChangeEvent, projectNameById],
  );

  const updateWarehouseLot = useCallback(
    (
      input: WarehouseLotUpdateInput,
    ): { ok: true } | { ok: false; error: string } => {
      const wh = warehouseRef.current;
      const lot = wh.lots.find((l) => l.id === input.lotId);
      if (!lot) return { ok: false, error: "Lot not found" };

      const nextInc =
        input.unitCostIncVat != null && Number.isFinite(input.unitCostIncVat)
          ? input.unitCostIncVat
          : lot.unitCostIncVat;
      if (nextInc < 0) return { ok: false, error: "Unit cost is invalid" };
      const nextEx =
        input.unitCostExVat !== undefined
          ? unitCostExFromInc(nextInc, input.unitCostExVat)
          : input.unitCostIncVat != null
            ? unitCostExFromInc(nextInc, null)
            : lot.unitCostExVat;
      const receivedAt = input.receivedAt?.trim() || lot.receivedAt;
      const costScale =
        lot.unitCostIncVat > 0 ? nextInc / lot.unitCostIncVat : 1;
      const costChanged = Math.abs(costScale - 1) > 1e-9;
      const cat =
        input.materialKind != null
          ? materialKindToExpense(input.materialKind)
          : {
              category: lot.category,
              subcategory: lot.subcategory,
            };

      if (input.itemId && !wh.items.some((i) => i.id === input.itemId)) {
        return { ok: false, error: "Catalog item not found" };
      }
      if (
        input.purchaseProjectId &&
        !projectsRef.current.some((p) => p.id === input.purchaseProjectId)
      ) {
        return { ok: false, error: "Purchase project not found" };
      }

      const nextExpenseId =
        input.expenseId !== undefined
          ? input.expenseId && input.expenseId.trim()
            ? input.expenseId.trim()
            : undefined
          : lot.expenseId;
      const nextPurchaseProjectId =
        input.purchaseProjectId?.trim() || lot.purchaseProjectId;
      const nextItemId = input.itemId?.trim() || lot.itemId;

      const patchLot = (l: typeof lot): typeof lot => {
        if (l.id !== input.lotId) return l;
        const nextLot = {
          ...l,
          itemId: nextItemId,
          unitCostIncVat: roundMoney(nextInc),
          unitCostExVat: roundMoney(nextEx),
          receivedAt,
          category: cat.category,
          purchaseProjectId: nextPurchaseProjectId,
        };
        if (cat.subcategory) nextLot.subcategory = cat.subcategory;
        else delete nextLot.subcategory;
        if (input.label !== undefined) {
          if (input.label?.trim()) nextLot.label = input.label.trim();
          else delete nextLot.label;
        }
        if (input.supplier !== undefined) {
          if (input.supplier?.trim()) nextLot.supplier = input.supplier.trim();
          else delete nextLot.supplier;
        }
        if (input.notes !== undefined) {
          if (input.notes?.trim()) nextLot.notes = input.notes.trim();
          else delete nextLot.notes;
        }
        if (input.expenseId !== undefined) {
          if (nextExpenseId) nextLot.expenseId = nextExpenseId;
          else delete nextLot.expenseId;
        }
        return nextLot;
      };

      setWarehouse((prev) => ({
        ...prev,
        lots: prev.lots.map(patchLot),
      }));

      setProjects((prev) =>
        prev.map((p) => {
          const schedule = (p.financials.expenseSchedule ?? []).map((e) => {
            if (e.warehouseLotId !== input.lotId) return e;
            const nextExp = {
              ...e,
              dueDate: receivedAt,
              category: cat.category,
            };
            if (e.actualDate) nextExp.actualDate = receivedAt;
            if (cat.subcategory) nextExp.subcategory = cat.subcategory;
            else delete nextExp.subcategory;
            if (input.label !== undefined) {
              if (input.label?.trim()) nextExp.label = input.label.trim();
            }
            if (costChanged) {
              nextExp.amount = roundMoney(e.amount * costScale);
              if (e.amountExVat != null) {
                nextExp.amountExVat = roundMoney(e.amountExVat * costScale);
              }
            }
            return nextExp;
          });
          return {
            ...p,
            financials: { ...p.financials, expenseSchedule: schedule },
          };
        }),
      );

      recordChangeEvent({
        domain: "warehouse",
        entityType: "lot",
        entityId: input.lotId,
        action: "update",
        summary: `Updated warehouse lot ${input.lotId.slice(0, 8)}`,
        payloadJson: {
          ...(costChanged ? { unitCostUpdated: true } : {}),
          ...(input.receivedAt ? { receivedAt } : {}),
          ...(input.expenseId !== undefined
            ? { expenseId: nextExpenseId ?? null }
            : {}),
          ...(input.purchaseProjectId
            ? { purchaseProjectId: nextPurchaseProjectId }
            : {}),
        },
      });
      if (costChanged) {
        recordChangeEvent(
          {
            id: createEventId(),
            domain: "finance_meta",
            entityType: "expense",
            entityId: input.lotId,
            action: "update",
            field: "amount",
            summary: `Rescaled expenses for warehouse lot ${input.lotId.slice(0, 8)}`,
            payloadJson: { lotId: input.lotId },
          },
          {
            entityType: "expense",
            entityId: input.lotId,
            action: "update",
            field: "amount",
            oldValue: formatValue(lot.unitCostIncVat),
            newValue: formatValue(nextInc),
            summary: `Lot unit cost ${formatValue(lot.unitCostIncVat)} → ${formatValue(nextInc)}`,
          },
        );
      }

      warehouseRef.current = {
        ...warehouseRef.current,
        lots: warehouseRef.current.lots.map(patchLot),
      };
      const reconcileIds = [lot.expenseId, nextExpenseId].filter(
        (id, i, arr): id is string => Boolean(id) && arr.indexOf(id) === i,
      );
      if (reconcileIds.length > 0) {
        reconcileBudgetExpenses(reconcileIds);
      }

      return { ok: true };
    },
    [recordChangeEvent, reconcileBudgetExpenses],
  );

  const deleteWarehouseLot = useCallback(
    (lotId: string): { ok: true } | { ok: false; error: string } => {
      const wh = warehouseRef.current;
      const lot = wh.lots.find((l) => l.id === lotId);
      if (!lot) return { ok: false, error: "Lot not found" };

      const removedAmounts: { projectId: string; amount: number; label?: string }[] =
        [];
      setProjects((prev) =>
        prev.map((p) => {
          const keep: typeof p.financials.expenseSchedule = [];
          for (const e of p.financials.expenseSchedule ?? []) {
            if (e.warehouseLotId === lotId) {
              removedAmounts.push({
                projectId: p.id,
                amount: e.amount,
                ...(e.label ? { label: e.label } : {}),
              });
            } else {
              keep.push(e);
            }
          }
          if (keep.length === (p.financials.expenseSchedule ?? []).length) {
            return p;
          }
          return {
            ...p,
            financials: { ...p.financials, expenseSchedule: keep },
          };
        }),
      );

      setWarehouse((prev) => ({
        ...prev,
        lots: prev.lots.filter((l) => l.id !== lotId),
        balances: prev.balances.filter((b) => b.lotId !== lotId),
        movements: prev.movements.filter((m) => m.lotId !== lotId),
      }));

      const totalRemoved = removedAmounts.reduce((s, r) => s + r.amount, 0);
      const budgetExpenseId = lot.expenseId;
      const summary = `Deleted warehouse lot ${lot.label ?? lotId.slice(0, 8)} (removed ${formatValue(totalRemoved)} from expenses)`;
      recordChangeEvent(
        {
          id: createEventId(),
          domain: "warehouse",
          entityType: "lot",
          entityId: lotId,
          projectId: lot.purchaseProjectId,
          action: "delete",
          summary,
          payloadJson: { itemId: lot.itemId },
        },
        {
          projectId: lot.purchaseProjectId,
          entityType: "expense",
          entityId: lotId,
          action: "delete",
          oldValue: formatValue(totalRemoved),
          summary,
        },
      );

      // Keep warehouseRef in sync for immediate reconcile
      warehouseRef.current = {
        ...warehouseRef.current,
        lots: warehouseRef.current.lots.filter((l) => l.id !== lotId),
        balances: warehouseRef.current.balances.filter((b) => b.lotId !== lotId),
        movements: warehouseRef.current.movements.filter((m) => m.lotId !== lotId),
      };
      if (budgetExpenseId) {
        reconcileBudgetExpenses([budgetExpenseId]);
      }

      return { ok: true };
    },
    [recordChangeEvent, reconcileBudgetExpenses],
  );

  deleteWarehouseLotRef.current = deleteWarehouseLot;

  // Settle / bump predicted expenses vs WH draws (e.g. after refresh on due date)
  useEffect(() => {
    if (!ready) return;
    reconcileBudgetExpenses();
    // once when app becomes ready with hydrated warehouse + projects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <ProjectsContext.Provider
      value={{
        teamMembers,
        addTeamMember,
        updateTeamMember,
        currentUserId,
        setCurrentUserId,
        meaningfulChangeMode,
        setMeaningfulChangeMode,
        changeEvents,
        financialHistory,
        financeSettings,
        updateFinanceSettings,
        metricsSettings,
        updateMetricsSettings,
        financeImport,
        applyFinanceImport,
        clearFinanceImport,
        importFinancialCsvText,
        projects,
        ready,
        aiEnabled,
        summarizing,
        addProject,
        addComment,
        updateProject,
        markClientContacted,
        updateComment,
        deleteComment,
        regenerateSummary,
        deleteProject,
        addTodo,
        toggleTodo,
        updateTodo,
        deleteTodo,
        addContact,
        updateContact,
        deleteContact,
        addProjectFile,
        updateProjectFile,
        deleteProjectFile,
        getProjectFileUrl,
        updateFinancials,
        addPayment,
        updatePayment,
        deletePayment,
        addExpense,
        updateExpense,
        deleteExpense,
        warehouse,
        ensureWarehouseHoldingProject,
        receiveStock,
        transferStock,
        consumeStock,
        adjustStock,
        updateWarehouseLot,
        deleteWarehouseLot,
        upsertWarehouseItem,
        upsertWarehouseGroup,
        deleteWarehouseGroup,
        importMoneyWorksWarehouse,
        applySystemSkladMapping,
        linkProjectWarehouseExpenses,
        saveWarehouseBom,
        duplicateWarehouseBom,
        deleteWarehouseBom,
        addMilestone,
        updateMilestone,
        deleteMilestone,
        addGanttPhase,
        updateGanttPhase,
        deleteGanttPhase,
        addGanttActivity,
        updateGanttActivity,
        deleteGanttActivity,
        addGanttDeadline,
        updateGanttDeadline,
        deleteGanttDeadline,
        shiftProjectSchedule,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsApi {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}
