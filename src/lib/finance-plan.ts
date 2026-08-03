import {
  CompanyFinanceSettings,
  DEFAULT_STAGE_PROBABILITIES,
  Project,
  ProjectPayment,
  Stage,
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
  stage: Stage;
  kind: CashKind;
  amount: number;
  expectedMonth: string;
  actualMonth: string | null;
  dueDate: string;
  actualDate?: string;
};

function collectEvents(project: Project): CashEvent[] {
  const f = project.financials;
  const events: CashEvent[] = [];

  for (const p of f.payments ?? []) {
    const due = effectiveScheduleDate(p, project);
    events.push({
      projectId: project.id,
      stage: project.stage,
      kind: "inflow",
      amount: p.amount,
      expectedMonth: monthKey(due),
      actualMonth: p.actualDate ? monthKey(p.actualDate) : null,
      dueDate: due,
      ...(p.actualDate ? { actualDate: p.actualDate } : {}),
    });
  }
  for (const e of f.expenseSchedule ?? []) {
    const due = effectiveScheduleDate(e, project);
    events.push({
      projectId: project.id,
      stage: project.stage,
      kind: "outflow",
      amount: e.amount,
      expectedMonth: monthKey(due),
      actualMonth: e.actualDate ? monthKey(e.actualDate) : null,
      dueDate: due,
      ...(e.actualDate ? { actualDate: e.actualDate } : {}),
    });
  }
  return events;
}

export type MonthlyPlanRow = {
  month: string;
  label: string;
  period: "past" | "current" | "future";
  openingCash: number;
  actualInflows: number;
  actualOutflows: number;
  actualNet: number;
  contractedInflows: number;
  contractedOutflows: number;
  contractedNet: number;
  companyOpexActual: number;
  companyOpexProjected: number;
  confirmedClosing: number;
  weightedInflows: number;
  weightedOutflows: number;
  weightedNet: number;
  expectedCash: number;
  unweightedInflows: number;
  unweightedOutflows: number;
  unweightedNet: number;
  belowMinWorkingCapital: boolean;
  expectedBelowMinWorkingCapital: boolean;
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

function monthKeysBetween(fromKey: string, toKey: string): string[] {
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

/**
 * Baseline (`openingCash` at `openingCashAsOf`) is cash at that month's open.
 * All later in/out comes from projects + company opex.
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
    actualIn: number;
    actualOut: number;
    contractedIn: number;
    contractedOut: number;
    weightedIn: number;
    weightedOut: number;
    unweightedIn: number;
    unweightedOut: number;
    companyOpexActual: number;
    companyOpexProjected: number;
  };

  const emptyBucket = (): Bucket => ({
    actualIn: 0,
    actualOut: 0,
    contractedIn: 0,
    contractedOut: 0,
    weightedIn: 0,
    weightedOut: 0,
    unweightedIn: 0,
    unweightedOut: 0,
    companyOpexActual: 0,
    companyOpexProjected: 0,
  });

  const buckets = new Map<string, Bucket>();
  for (const key of calcMonths) buckets.set(key, emptyBucket());

  function add(key: string, field: keyof Bucket, amount: number) {
    if (key < asOf) return;
    if (!monthSet.has(key)) return;
    const b = buckets.get(key);
    if (!b) return;
    b[field] += amount;
  }

  for (const ev of events) {
    if (ev.actualMonth) {
      if (ev.kind === "inflow") add(ev.actualMonth, "actualIn", ev.amount);
      else add(ev.actualMonth, "actualOut", ev.amount);
      continue;
    }
    if (isContracted(ev.stage)) {
      if (ev.kind === "inflow") add(ev.expectedMonth, "contractedIn", ev.amount);
      else add(ev.expectedMonth, "contractedOut", ev.amount);
    } else if (isPipeline(ev.stage)) {
      const p = probabilityFor(ev.stage, settings) / 100;
      if (ev.kind === "inflow") {
        add(ev.expectedMonth, "unweightedIn", ev.amount);
        add(ev.expectedMonth, "weightedIn", ev.amount * p);
      } else {
        add(ev.expectedMonth, "unweightedOut", ev.amount);
        add(ev.expectedMonth, "weightedOut", ev.amount * p);
      }
    }
  }

  for (const opex of settings.monthlyExpenses ?? []) {
    if (opex.amount <= 0) continue;
    if (opex.status === "actual") {
      add(opex.month, "companyOpexActual", opex.amount);
      add(opex.month, "actualOut", opex.amount);
    } else {
      add(opex.month, "companyOpexProjected", opex.amount);
      add(opex.month, "contractedOut", opex.amount);
    }
  }

  if (options.companyIncomesByMonth) {
    for (const [month, amount] of options.companyIncomesByMonth) {
      if (amount > 0) add(month, "actualIn", amount);
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
          actualInflows: 0,
          actualOutflows: 0,
          actualNet: 0,
          contractedInflows: 0,
          contractedOutflows: 0,
          contractedNet: 0,
          companyOpexActual: 0,
          companyOpexProjected: 0,
          confirmedClosing: opening,
          weightedInflows: 0,
          weightedOutflows: 0,
          weightedNet: 0,
          expectedCash: opening,
          unweightedInflows: 0,
          unweightedOutflows: 0,
          unweightedNet: 0,
          belowMinWorkingCapital: opening < minWc,
          expectedBelowMinWorkingCapital: opening < minWc,
        });
      }
      continue;
    }

    const b = buckets.get(key) ?? emptyBucket();
    const actualNet = b.actualIn - b.actualOut;
    const contractedNet = b.contractedIn - b.contractedOut;
    const weightedNet = b.weightedIn - b.weightedOut;
    const unweightedNet = b.unweightedIn - b.unweightedOut;
    const confirmedClosing = opening + actualNet + contractedNet;
    const expectedCash = confirmedClosing + weightedNet;

    if (key >= viewFrom && key <= viewTo) {
      rows.push({
        month: key,
        label: formatMonthLabel(key),
        period: monthPeriod(key, currentKey),
        openingCash: opening,
        actualInflows: b.actualIn,
        actualOutflows: b.actualOut,
        actualNet,
        contractedInflows: b.contractedIn,
        contractedOutflows: b.contractedOut,
        contractedNet,
        companyOpexActual: b.companyOpexActual,
        companyOpexProjected: b.companyOpexProjected,
        confirmedClosing,
        weightedInflows: b.weightedIn,
        weightedOutflows: b.weightedOut,
        weightedNet,
        expectedCash,
        unweightedInflows: b.unweightedIn,
        unweightedOutflows: b.unweightedOut,
        unweightedNet,
        belowMinWorkingCapital: confirmedClosing < minWc,
        expectedBelowMinWorkingCapital: expectedCash < minWc,
      });
    }

    opening = confirmedClosing;
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
    .filter((e) => e.actualDate)
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
