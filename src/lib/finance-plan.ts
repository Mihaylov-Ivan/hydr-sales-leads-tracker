import {
  CASH_EXPENSE_CATEGORIES,
  CompanyFinanceSettings,
  DEFAULT_STAGE_PROBABILITIES,
  Project,
  ProjectExpenseCategory,
  ProjectPayment,
  Stage,
  normalizeCompanyMonthlyExpense,
  normalizeProjectExpense,
  todayDate,
} from "./types";
import { resolveLinkedDeadlineDate } from "./gantt-finance";

export function isContracted(stage: Stage): boolean {
  return stage === "under-development" || stage === "commissioned";
}

export function isPipeline(stage: Stage): boolean {
  return stage === "cold-lead" || stage === "hot-lead";
}

export function probabilityFor(
  stage: Stage,
  settings: CompanyFinanceSettings,
): number {
  if (stage === "cancelled" || stage === "to-contact") return 0;
  const fromSettings = settings.stageProbabilities[stage];
  if (typeof fromSettings === "number" && Number.isFinite(fromSettings)) {
    return Math.min(100, Math.max(0, fromSettings));
  }
  return DEFAULT_STAGE_PROBABILITIES[stage] ?? 0;
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // yyyy-mm
}

function addMonths(
  year: number,
  monthIndex: number,
  delta: number,
): {
  year: number;
  monthIndex: number;
  key: string;
} {
  const d = new Date(year, monthIndex + delta, 1);
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    year: y,
    monthIndex: m,
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

function effectiveScheduleDate(
  item: { dueDate: string; milestoneId?: string },
  project: Project,
): string {
  return resolveLinkedDeadlineDate(item.milestoneId, project) ?? item.dueDate;
}

type CashKind = "inflow" | "outflow";

type CashEvent = {
  projectId: string;
  projectName: string;
  stage: Stage;
  kind: CashKind;
  amount: number;
  expectedMonth: string;
  actualMonth: string | null;
  dueDate: string;
  actualDate?: string;
  /** Income from maintenance / service (not contract milestone payment) */
  isMaintenance?: boolean;
  /** Set for cash-affecting project outflows */
  expenseCategory?: Extract<
    ProjectExpenseCategory,
    "materials" | "installation" | "maintenance" | "admin"
  >;
};

function collectEvents(project: Project): CashEvent[] {
  const f = project.financials;
  const events: CashEvent[] = [];

  for (const p of f.payments ?? []) {
    const due = p.isMaintenance
      ? p.dueDate
      : effectiveScheduleDate(p, project);
    events.push({
      projectId: project.id,
      projectName: project.name,
      stage: project.stage,
      kind: "inflow",
      amount: p.amount,
      expectedMonth: monthKey(due),
      actualMonth: p.actualDate ? monthKey(p.actualDate) : null,
      dueDate: due,
      ...(p.actualDate ? { actualDate: p.actualDate } : {}),
      ...(p.isMaintenance ? { isMaintenance: true } : {}),
    });
  }
  for (const raw of f.expenseSchedule ?? []) {
    const e = normalizeProjectExpense(raw);
    const category = e.category ?? "materials";
    // man-hr is allocated labour already covered by company salary — skip cash
    if (!CASH_EXPENSE_CATEGORIES.has(category)) continue;

    const due = effectiveScheduleDate(e, project);
    events.push({
      projectId: project.id,
      projectName: project.name,
      stage: project.stage,
      kind: "outflow",
      amount: e.amount,
      expectedMonth: monthKey(due),
      actualMonth: e.actualDate ? monthKey(e.actualDate) : null,
      dueDate: due,
      ...(e.actualDate ? { actualDate: e.actualDate } : {}),
      expenseCategory: category as
        | "materials"
        | "installation"
        | "maintenance"
        | "admin",
    });
  }
  return events;
}

export type MonthlyProjectBreakdown = {
  projectId: string;
  projectName: string;
  amount: number;
};

export type MonthlyPlanRow = {
  month: string;
  label: string;
  period: "past" | "current" | "future";
  openingCash: number;
  /** All project payment inflows in this month (actual date or scheduled) */
  projectIn: number;
  /** Company fixed monthly outgoings */
  fixedMonthly: number;
  materialsOut: number;
  installationOut: number;
  maintenanceOut: number;
  adminOut: number;
  projectInByProject: MonthlyProjectBreakdown[];
  materialsByProject: MonthlyProjectBreakdown[];
  installationByProject: MonthlyProjectBreakdown[];
  maintenanceByProject: MonthlyProjectBreakdown[];
  adminByProject: MonthlyProjectBreakdown[];
  /** projectIn − materials − install − maintenance − admin − fixedMonthly */
  net: number;
  /** Opening + net */
  closingCash: number;
  belowMinWorkingCapital: boolean;
};

export type BuildMonthlyPlanOptions = {
  /** First visible month (yyyy-mm) */
  fromMonth?: string;
  /** Last visible month (yyyy-mm) */
  toMonth?: string;
  pastMonths?: number;
  futureMonths?: number;
  monthCount?: number;
  today?: string;
  /** Company-level actual income by month (from Excel/CSV import) */
  companyIncomesByMonth?: Map<string, number>;
};

function parseMonthKey(key: string): { year: number; monthIndex: number } {
  const [ys, ms] = key.split("-");
  return { year: Number(ys), monthIndex: Number(ms) - 1 };
}

function formatMonthLabel(key: string): string {
  const { year, monthIndex } = parseMonthKey(key);
  return new Date(year, monthIndex, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthPeriod(
  key: string,
  currentKey: string,
): "past" | "current" | "future" {
  if (key < currentKey) return "past";
  if (key > currentKey) return "future";
  return "current";
}

export function monthKeysBetween(fromKey: string, toKey: string): string[] {
  if (toKey < fromKey) return [];
  const { year, monthIndex } = parseMonthKey(fromKey);
  const keys: string[] = [];
  for (let i = 0; i < 240; i++) {
    const key = addMonths(year, monthIndex, i).key;
    keys.push(key);
    if (key >= toKey) break;
  }
  return keys;
}

export type FixedMonthlyEstimate = {
  /** Rounded average of positive lookback months */
  average: number;
  /** Months that contributed to the average */
  sampleMonths: string[];
  /** First month the estimate would apply to (current calendar month) */
  applyFrom: string;
};

/**
 * Suggest future Fixed monthly from the average of the prior `lookbackMonths`
 * (default 6). Skips zeros / missing months and anything before `asOfMonth`.
 */
export function estimateFixedMonthlyAverage(
  monthlyExpenses: { month: string; fixedMonthly?: number }[],
  options: {
    currentMonth: string;
    asOfMonth?: string | null;
    lookbackMonths?: number;
  },
): FixedMonthlyEstimate | null {
  const currentMonth = options.currentMonth.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(currentMonth)) return null;
  const lookback = options.lookbackMonths ?? 6;
  const asOf = (options.asOfMonth ?? "").slice(0, 7);

  const { year, monthIndex } = parseMonthKey(currentMonth);
  const byMonth = new Map<string, number>();
  for (const raw of monthlyExpenses) {
    const e = normalizeCompanyMonthlyExpense(raw);
    if (!e || !(e.fixedMonthly > 0)) continue;
    byMonth.set(e.month, e.fixedMonthly);
  }

  const samples: { month: string; amount: number }[] = [];
  for (let i = 1; i <= lookback; i++) {
    const key = addMonths(year, monthIndex, -i).key;
    if (asOf && key < asOf) continue;
    const amount = byMonth.get(key);
    if (amount != null && amount > 0) {
      samples.push({ month: key, amount });
    }
  }

  if (samples.length === 0) return null;
  const sum = samples.reduce((acc, s) => acc + s.amount, 0);
  const average = Math.round((sum / samples.length) * 100) / 100;
  if (!(average > 0)) return null;

  return {
    average,
    sampleMonths: samples
      .map((s) => s.month)
      .sort((a, b) => a.localeCompare(b)),
    applyFrom: currentMonth,
  };
}

/**
 * Baseline (`openingCash` at `openingCashAsOf`) is cash at that month's open.
 * Firm cash out = company fixed monthly + project materials + installation + maintenance + admin.
 * Project man-hr is excluded (covered by company fixed monthly / payroll).
 * Pipeline project cash is included at face value (no win-probability weighting).
 * `fromMonth`/`toMonth` only control which months are visible — independent of baseline.
 */
export function buildMonthlyPlan(
  projects: Project[],
  settings: CompanyFinanceSettings,
  options: BuildMonthlyPlanOptions = {},
): MonthlyPlanRow[] {
  const today = options.today ?? todayDate();
  const currentKey = monthKey(today);
  const { year: curY, monthIndex: curM } = parseMonthKey(currentKey);

  const pastMonths = options.pastMonths ?? 6;
  const futureMonths = options.futureMonths ?? options.monthCount ?? 18;

  const viewFrom =
    options.fromMonth ?? addMonths(curY, curM, -pastMonths).key;
  const viewTo =
    options.toMonth ?? addMonths(curY, curM, futureMonths - 1).key;

  const asOf = settings.openingCashAsOf ?? viewFrom;
  const calcFrom = asOf < viewFrom ? asOf : viewFrom;
  const calcTo = viewTo < viewFrom ? viewFrom : viewTo;
  const calcMonths = monthKeysBetween(calcFrom, calcTo);
  const monthSet = new Set(calcMonths);

  const events = projects
    .filter((p) => p.stage !== "cancelled")
    .flatMap(collectEvents);

  type Bucket = {
    projectIn: number;
    fixedMonthly: number;
    materialsOut: number;
    installationOut: number;
    maintenanceOut: number;
    adminOut: number;
    projectInById: Map<string, MonthlyProjectBreakdown>;
    materialsById: Map<string, MonthlyProjectBreakdown>;
    installationById: Map<string, MonthlyProjectBreakdown>;
    maintenanceById: Map<string, MonthlyProjectBreakdown>;
    adminById: Map<string, MonthlyProjectBreakdown>;
  };

  const emptyBucket = (): Bucket => ({
    projectIn: 0,
    fixedMonthly: 0,
    materialsOut: 0,
    installationOut: 0,
    maintenanceOut: 0,
    adminOut: 0,
    projectInById: new Map(),
    materialsById: new Map(),
    installationById: new Map(),
    maintenanceById: new Map(),
    adminById: new Map(),
  });

  const buckets = new Map<string, Bucket>();
  for (const key of calcMonths) buckets.set(key, emptyBucket());

  function add(key: string, field: keyof Bucket, amount: number) {
    if (key < asOf) return;
    if (!monthSet.has(key)) return;
    const b = buckets.get(key);
    if (!b) return;
    if (
      field === "projectInById" ||
      field === "materialsById" ||
      field === "installationById" ||
      field === "maintenanceById" ||
      field === "adminById"
    ) {
      return;
    }
    b[field] += amount;
  }

  function addProject(
    key: string,
    map: Map<string, MonthlyProjectBreakdown>,
    projectId: string,
    projectName: string,
    amount: number,
  ) {
    if (key < asOf) return;
    if (!monthSet.has(key)) return;
    const existing = map.get(projectId);
    if (existing) {
      existing.amount += amount;
    } else {
      map.set(projectId, { projectId, projectName, amount });
    }
  }

  function sortedBreakdown(
    map: Map<string, MonthlyProjectBreakdown>,
  ): MonthlyProjectBreakdown[] {
    return [...map.values()].sort(
      (a, b) =>
        b.amount - a.amount || a.projectName.localeCompare(b.projectName),
    );
  }

  for (const ev of events) {
    // Face-value firm plan: contracted + pipeline schedules, plus anything already actualized
    if (
      !ev.actualMonth &&
      !isContracted(ev.stage) &&
      !isPipeline(ev.stage)
    ) {
      continue;
    }
    const month = ev.actualMonth ?? ev.expectedMonth;
    const b = buckets.get(month);
    if (ev.kind === "inflow") {
      add(month, "projectIn", ev.amount);
      if (b) {
        addProject(
          month,
          b.projectInById,
          ev.isMaintenance ? `${ev.projectId}::maint` : ev.projectId,
          ev.isMaintenance
            ? `${ev.projectName} · Maintenance`
            : ev.projectName,
          ev.amount,
        );
      }
      continue;
    }
    if (ev.expenseCategory === "materials") {
      add(month, "materialsOut", ev.amount);
      if (b) {
        addProject(
          month,
          b.materialsById,
          ev.projectId,
          ev.projectName,
          ev.amount,
        );
      }
    } else if (ev.expenseCategory === "installation") {
      add(month, "installationOut", ev.amount);
      if (b) {
        addProject(
          month,
          b.installationById,
          ev.projectId,
          ev.projectName,
          ev.amount,
        );
      }
    } else if (ev.expenseCategory === "maintenance") {
      add(month, "maintenanceOut", ev.amount);
      if (b) {
        addProject(
          month,
          b.maintenanceById,
          ev.projectId,
          ev.projectName,
          ev.amount,
        );
      }
    } else if (ev.expenseCategory === "admin") {
      add(month, "adminOut", ev.amount);
      if (b) {
        addProject(
          month,
          b.adminById,
          ev.projectId,
          ev.projectName,
          ev.amount,
        );
      }
    }
  }

  for (const raw of settings.monthlyExpenses ?? []) {
    const opex = normalizeCompanyMonthlyExpense(raw);
    if (!opex) continue;
    if (opex.fixedMonthly > 0) {
      add(opex.month, "fixedMonthly", opex.fixedMonthly);
    }
  }

  if (options.companyIncomesByMonth) {
    for (const [month, amount] of options.companyIncomesByMonth) {
      if (amount > 0) {
        add(month, "projectIn", amount);
        const b = buckets.get(month);
        if (b) {
          addProject(month, b.projectInById, "__company__", "Company", amount);
        }
      }
    }
  }

  const rows: MonthlyPlanRow[] = [];
  let opening = settings.openingCash;
  const minWc = settings.minWorkingCapital;

  for (const key of calcMonths) {
    if (key < asOf) {
      if (key >= viewFrom && key <= viewTo) {
        rows.push({
          month: key,
          label: formatMonthLabel(key),
          period: monthPeriod(key, currentKey),
          openingCash: opening,
          projectIn: 0,
          fixedMonthly: 0,
          materialsOut: 0,
          installationOut: 0,
          maintenanceOut: 0,
          adminOut: 0,
          projectInByProject: [],
          materialsByProject: [],
          installationByProject: [],
          maintenanceByProject: [],
          adminByProject: [],
          net: 0,
          closingCash: opening,
          belowMinWorkingCapital: opening < minWc,
        });
      }
      continue;
    }

    const b = buckets.get(key) ?? emptyBucket();
    const out =
      b.materialsOut +
      b.installationOut +
      b.maintenanceOut +
      b.adminOut +
      b.fixedMonthly;
    const net = b.projectIn - out;
    const closingCash = opening + net;

    if (key >= viewFrom && key <= viewTo) {
      rows.push({
        month: key,
        label: formatMonthLabel(key),
        period: monthPeriod(key, currentKey),
        openingCash: opening,
        projectIn: b.projectIn,
        fixedMonthly: b.fixedMonthly,
        materialsOut: b.materialsOut,
        installationOut: b.installationOut,
        maintenanceOut: b.maintenanceOut,
        adminOut: b.adminOut,
        projectInByProject: sortedBreakdown(b.projectInById),
        materialsByProject: sortedBreakdown(b.materialsById),
        installationByProject: sortedBreakdown(b.installationById),
        maintenanceByProject: sortedBreakdown(b.maintenanceById),
        adminByProject: sortedBreakdown(b.adminById),
        net,
        closingCash,
        belowMinWorkingCapital: closingCash < minWc,
      });
    }

    opening = closingCash;
  }

  return rows;
}

export type ContractedProjectKpis = {
  project: Project;
  contractValue: number | null;
  margin: number | null;
  remainingCost: number | null;
  cashBalance: number;
  nextPayment: ProjectPayment | null;
  nextPaymentDate: string | null;
  overduePayments: number;
  overdueExpenses: number;
};

function itemIsOverdue(
  item: { dueDate: string; actualDate?: string; milestoneId?: string },
  project: Project,
  today: string,
): boolean {
  if (item.actualDate) return false;
  const due = effectiveScheduleDate(item, project);
  return due < today;
}

export function contractedProjectKpis(
  project: Project,
  today: string = todayDate(),
): ContractedProjectKpis {
  const f = project.financials;
  const payments = f.payments ?? [];
  const expenses = f.expenseSchedule ?? [];

  const actualIn = payments
    .filter((p) => p.actualDate)
    .reduce((s, p) => s + p.amount, 0);
  const actualOut = expenses
    .map(normalizeProjectExpense)
    .filter((e) => e.actualDate && CASH_EXPENSE_CATEGORIES.has(e.category!))
    .reduce((s, e) => s + e.amount, 0);

  const contractValue = f.contractValue ?? null;
  const overallExpenses = f.expenses ?? null;
  const margin =
    contractValue != null && overallExpenses != null
      ? contractValue - overallExpenses
      : (f.expectedProfit ?? null);

  const remainingCost =
    overallExpenses != null ? Math.max(0, overallExpenses - actualOut) : null;

  const pendingPayments = payments
    .filter((p) => !p.actualDate)
    .map((p) => ({
      payment: p,
      date: effectiveScheduleDate(p, project),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    project,
    contractValue,
    margin,
    remainingCost,
    cashBalance: actualIn - actualOut,
    nextPayment: pendingPayments[0]?.payment ?? null,
    nextPaymentDate: pendingPayments[0]?.date ?? null,
    overduePayments: payments.filter((p) =>
      itemIsOverdue(p, project, today),
    ).length,
    overdueExpenses: expenses.filter((e) =>
      itemIsOverdue(e, project, today),
    ).length,
  };
}

export type PipelineProjectKpis = {
  project: Project;
  probability: number;
  unweightedValue: number | null;
  weightedValue: number | null;
};

export function pipelineProjectKpis(
  project: Project,
  settings: CompanyFinanceSettings,
): PipelineProjectKpis {
  const probability = probabilityFor(project.stage, settings);
  const value = project.financials.contractValue ?? null;
  return {
    project,
    probability,
    unweightedValue: value,
    weightedValue: value != null ? (value * probability) / 100 : null,
  };
}

export function partitionFinanceProjects(
  projects: Project[],
  settings: CompanyFinanceSettings,
  today: string = todayDate(),
): {
  contracted: ContractedProjectKpis[];
  pipeline: PipelineProjectKpis[];
} {
  const active = projects.filter((p) => p.stage !== "cancelled");
  return {
    contracted: active
      .filter((p) => isContracted(p.stage))
      .map((p) => contractedProjectKpis(p, today)),
    pipeline: active
      .filter((p) => isPipeline(p.stage))
      .map((p) => pipelineProjectKpis(p, settings)),
  };
}
