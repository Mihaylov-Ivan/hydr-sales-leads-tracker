import type {
  Project,
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectMilestone,
  ProjectPayment,
  ProjectSchedule,
} from "./types";
import {
  DEFAULT_OPEX_EXPENSE_PERCENT,
  MILESTONE_LABELS,
  addCalendarYears,
  addDays,
  amountExFromInc,
  emptySchedule,
  phaseEndDate,
} from "./types";

/** Schedule event (or legacy finance milestone) a payment/expense can link to. */
export type LinkableDeadline = {
  id: string;
  date: string;
  label: string;
  kind: "phase" | "activity" | "deadline" | "finance";
};

function activityEndDate(a: ProjectGanttActivity): string {
  return addDays(a.startDate, Math.max(1, a.durationDays) - 1);
}

function normalizeScheduleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function nameMatches(name: string, needles: string[]): boolean {
  const n = normalizeScheduleName(name);
  return needles.some((needle) => n.includes(needle));
}

function findDeadline(
  schedule: ProjectSchedule,
  opts: { wbs?: string; nameIncludes: string[] },
): ProjectGanttDeadline | undefined {
  const deadlines = schedule.deadlines ?? [];
  if (opts.wbs) {
    const byWbs = deadlines.find((d) => d.wbs === opts.wbs);
    if (byWbs) return byWbs;
  }
  return deadlines.find((d) => nameMatches(d.name, opts.nameIncludes));
}

function findActivity(
  schedule: ProjectSchedule,
  opts: { wbs?: string; nameIncludes: string[] },
): ProjectGanttActivity | undefined {
  const activities = schedule.activities ?? [];
  if (opts.wbs) {
    const byWbs = activities.find((a) => a.wbs === opts.wbs);
    if (byWbs) return byWbs;
  }
  return activities.find((a) => nameMatches(a.name, opts.nameIncludes));
}

export type StandardIncomeAnchorKey =
  | "prepayment"
  | "design-approval"
  | "engineering-done"
  | "fat"
  | "site-prep"
  | "final-certificate";

/** Default payment shares of contract value, keyed to standard delivery Gantt events. */
export const STANDARD_INCOME_SCHEDULE: ReadonlyArray<{
  key: StandardIncomeAnchorKey;
  percent: number;
  label: string;
}> = [
  { key: "prepayment", percent: 60, label: "Prepayment" },
  { key: "design-approval", percent: 10, label: "Design approval" },
  { key: "engineering-done", percent: 10, label: "Engineering done" },
  { key: "fat", percent: 10, label: "FAT" },
  { key: "site-prep", percent: 5, label: "Site prep and delivery" },
  { key: "final-certificate", percent: 5, label: "Final certificate" },
];

export type StandardIncomeAnchor = {
  key: StandardIncomeAnchorKey;
  percent: number;
  label: string;
  dueDate: string;
  /** Gantt deadline/activity id when the date should follow the schedule */
  milestoneId?: string;
};

export type StandardIncomeAnchorsResult =
  | { ok: true; anchors: StandardIncomeAnchor[] }
  | { ok: false; missing: string[]; error: string };

function hasGanttSchedule(schedule: ProjectSchedule | undefined): boolean {
  if (!schedule) return false;
  return (
    (schedule.phases?.length ?? 0) > 0 ||
    (schedule.deadlines?.length ?? 0) > 0 ||
    (schedule.activities?.length ?? 0) > 0
  );
}

/**
 * Resolve the six default income dates from a delivery Gantt.
 * Requires a schedule and every anchor event to be present.
 */
export function resolveStandardIncomeAnchors(
  schedule: ProjectSchedule | undefined,
): StandardIncomeAnchorsResult {
  if (!hasGanttSchedule(schedule)) {
    return {
      ok: false,
      missing: STANDARD_INCOME_SCHEDULE.map((s) => s.label),
      error: "Add a Gantt schedule first (auto-generate delivery Gantt).",
    };
  }
  const s = schedule!;
  const missing: string[] = [];
  const resolved: StandardIncomeAnchor[] = [];

  for (const spec of STANDARD_INCOME_SCHEDULE) {
    let dueDate: string | undefined;
    let milestoneId: string | undefined;

    if (spec.key === "prepayment") {
      const d = findDeadline(s, {
        wbs: "1.1",
        nameIncludes: ["prepayment", "contract signed"],
      });
      if (d) {
        dueDate = d.date;
        milestoneId = d.id;
      }
    } else if (spec.key === "design-approval") {
      const d = findDeadline(s, {
        wbs: "2.3",
        nameIncludes: ["design approval"],
      });
      if (d) {
        dueDate = d.date;
        milestoneId = d.id;
      }
    } else if (spec.key === "engineering-done") {
      const d = findDeadline(s, {
        wbs: "2.4",
        nameIncludes: ["engineering complete", "engineering done"],
      });
      if (d) {
        dueDate = d.date;
        milestoneId = d.id;
      }
    } else if (spec.key === "fat") {
      const d = findDeadline(s, {
        wbs: "3.4",
        nameIncludes: ["fat complete", "fat"],
      });
      if (d) {
        dueDate = d.date;
        milestoneId = d.id;
      }
    } else if (spec.key === "site-prep") {
      // Payment on start of packing / site prep (not activity end).
      const a = findActivity(s, {
        wbs: "4.1",
        nameIncludes: [
          "packing, shipping and site preparation",
          "site preparation",
          "site prep",
        ],
      });
      if (a?.startDate) {
        dueDate = a.startDate;
        // Do not link milestoneId — linked activities resolve to end date.
      }
    } else if (spec.key === "final-certificate") {
      const d = findDeadline(s, {
        wbs: "4.6",
        nameIncludes: ["fac", "contract complete", "final certificate"],
      });
      if (d) {
        dueDate = d.date;
        milestoneId = d.id;
      }
    }

    if (!dueDate) {
      missing.push(spec.label);
      continue;
    }
    resolved.push({
      key: spec.key,
      percent: spec.percent,
      label: spec.label,
      dueDate,
      ...(milestoneId ? { milestoneId } : {}),
    });
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error: `Missing schedule dates: ${missing.join(", ")}.`,
    };
  }
  return { ok: true, anchors: resolved };
}

export type IncomeFromScheduleDraft = {
  amount: number;
  percent: number;
  dueDate: string;
  label: string;
  milestoneId?: string;
};

/** Build income lines from contract value + resolved Gantt anchors (100% schedule). */
export function incomeDraftsFromScheduleAnchors(
  contractValue: number,
  anchors: StandardIncomeAnchor[],
): IncomeFromScheduleDraft[] {
  if (!(contractValue > 0) || anchors.length === 0) return [];
  const amounts = allocateTotalByWeights(
    contractValue,
    anchors.map((a) => a.percent),
  );
  return anchors.map((a, i) => ({
    amount: amounts[i]!,
    percent: a.percent,
    dueDate: a.dueDate,
    label: a.label,
    ...(a.milestoneId ? { milestoneId: a.milestoneId } : {}),
  }));
}

function phaseLabel(p: ProjectGanttPhase): string {
  const name = p.name.trim() || "Phase";
  return p.wbs ? `${p.wbs} ${name}` : name;
}

function activityLabel(a: ProjectGanttActivity): string {
  const name = a.name.trim() || "Activity";
  return a.wbs ? `${a.wbs} ${name}` : name;
}

function deadlineLabel(d: ProjectGanttDeadline): string {
  const name = d.name.trim() || "Deadline";
  return d.wbs ? `${d.wbs} ${name}` : name;
}

function financeMilestoneLabel(m: ProjectMilestone): string {
  const base = MILESTONE_LABELS[m.kind] ?? m.kind;
  return m.note?.trim() ? `${base} · ${m.note.trim()}` : base;
}

/** Gantt schedule events for linking income/expenses (phases, activities, milestones). */
export function ganttLinkableDeadlines(
  schedule: ProjectSchedule | undefined,
): LinkableDeadline[] {
  const s = schedule ?? emptySchedule();
  const phases = [...(s.phases ?? [])]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate),
    )
    .map((p) => ({
      id: p.id,
      date: phaseEndDate(p),
      label: `Phase · ${phaseLabel(p)}`,
      kind: "phase" as const,
    }));
  const activities = [...(s.activities ?? [])]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((a) => ({
      id: a.id,
      date: activityEndDate(a),
      label: `Activity · ${activityLabel(a)}`,
      kind: "activity" as const,
    }));
  const deadlines = [...(s.deadlines ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      id: d.id,
      date: d.date,
      label: `Milestone · ${deadlineLabel(d)}`,
      kind: "deadline" as const,
    }));
  return [...phases, ...activities, ...deadlines].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/**
 * All linkable events for a project: Gantt first, then any leftover
 * finance-only milestones (e.g. Excel import) not already represented.
 */
export function projectLinkableDeadlines(project: Project): LinkableDeadline[] {
  const fromGantt = ganttLinkableDeadlines(project.schedule);
  const ganttIds = new Set(fromGantt.map((d) => d.id));
  const fromFinance = (project.financials.milestones ?? [])
    .filter((m) => !ganttIds.has(m.id))
    .map((m) => ({
      id: m.id,
      date: m.date,
      label: financeMilestoneLabel(m),
      kind: "finance" as const,
    }));
  return [...fromGantt, ...fromFinance].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/** Resolve the date for a payment/expense linked to a schedule event id. */
export function resolveLinkedDeadlineDate(
  milestoneId: string | undefined,
  project: Project | undefined,
): string | undefined {
  if (!milestoneId || !project) return undefined;
  const schedule = project.schedule ?? emptySchedule();
  const deadline = schedule.deadlines.find((d) => d.id === milestoneId);
  if (deadline) return deadline.date;
  const activity = (schedule.activities ?? []).find((a) => a.id === milestoneId);
  if (activity) return activityEndDate(activity);
  const phase = schedule.phases.find((p) => p.id === milestoneId);
  if (phase) return phaseEndDate(phase);
  const finance = project.financials.milestones.find((m) => m.id === milestoneId);
  return finance?.date;
}

export function findLinkableDeadline(
  milestoneId: string | undefined,
  deadlines: LinkableDeadline[],
): LinkableDeadline | undefined {
  if (!milestoneId) return undefined;
  return deadlines.find((d) => d.id === milestoneId);
}

export function isFinanceImportId(id: string): boolean {
  return id.startsWith("import-");
}

/** Split `total` across `weights` (2 decimal places; last row takes remainder). */
export function allocateTotalByWeights(
  total: number,
  weights: number[],
): number[] {
  const n = weights.length;
  if (n === 0 || !(total > 0)) return [];
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!(sum > 0)) return [];
  const amounts: number[] = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      amounts.push(Math.round((total - allocated) * 100) / 100);
    } else {
      const amt = Math.round(((weights[i]! / sum) * total) * 100) / 100;
      amounts.push(amt);
      allocated += amt;
    }
  }
  return amounts;
}

export type MaterialsExpenseFromIncomeDraft = {
  amount: number;
  amountExVat: number;
  percent: number;
  dueDate: string;
  label: string;
  milestoneId?: string;
};

/**
 * Manufacture-materials expense lines matching income dates and shares of
 * total income. Skips Finance-import, maintenance/OPEX, and zero amounts.
 */
export function materialsExpenseDraftsFromIncomes(
  payments: ProjectPayment[],
  maxMaterials: number,
): MaterialsExpenseFromIncomeDraft[] {
  if (!(maxMaterials > 0)) return [];
  const sources = [...payments]
    .filter(
      (p) =>
        !isFinanceImportId(p.id) &&
        !p.isMaintenance &&
        !p.isOpex &&
        p.amount > 0,
    )
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
  if (sources.length === 0) return [];
  const weights = sources.map((p) => p.amount);
  const amounts = allocateTotalByWeights(maxMaterials, weights);
  const percents = allocateTotalByWeights(100, weights);
  return sources.map((p, i) => {
    const amount = amounts[i]!;
    const percent = percents[i]!;
    const baseLabel = p.label?.trim();
    return {
      amount,
      amountExVat: amountExFromInc(amount),
      percent,
      dueDate: p.dueDate,
      label: baseLabel
        ? `Manufacture materials · ${baseLabel}`
        : "Manufacture materials",
      ...(p.isMaintenance || p.isOpex || !p.milestoneId
        ? {}
        : { milestoneId: p.milestoneId }),
    };
  });
}

export type InstallationCompleteResult =
  | {
      ok: true;
      date: string;
      /** Gantt activity id (Installation WBS 4.2) */
      activityId: string;
      label: string;
    }
  | { ok: false; error: string };

/**
 * Installation complete = end of Installation activity (WBS 4.2).
 */
export function resolveInstallationCompleteDate(
  schedule: ProjectSchedule | undefined,
): InstallationCompleteResult {
  if (!hasGanttSchedule(schedule)) {
    return {
      ok: false,
      error: "Add a Gantt schedule first (auto-generate delivery Gantt).",
    };
  }
  const activity = findActivity(schedule!, {
    wbs: "4.2",
    nameIncludes: ["installation"],
  });
  if (!activity?.startDate) {
    return {
      ok: false,
      error:
        "Missing Installation activity (WBS 4.2). Add it to the Gantt schedule.",
    };
  }
  const date = activityEndDate(activity);
  return {
    ok: true,
    date,
    activityId: activity.id,
    label: activityLabel(activity),
  };
}

export type OpexIncomeDraft = {
  amount: number;
  dueDate: string;
  label: string;
  yearIndex: number;
};

export type OpexExpenseDraft = {
  amount: number;
  amountExVat: number;
  percent: number;
  dueDate: string;
  label: string;
  yearIndex: number;
};

export type OpexScheduleDrafts = {
  incomes: OpexIncomeDraft[];
  expenses: OpexExpenseDraft[];
  installCompleteDate: string;
  expensePercent: number;
};

export type OpexScheduleDraftsResult =
  | { ok: true; drafts: OpexScheduleDrafts }
  | { ok: false; error: string };

/**
 * Build yearly OPEX income + expense lines from installation complete.
 *
 * - First year is **one year after** Installation end (WBS 4.2).
 * - Years 1..warrantyYears: expense only (no income).
 * - Years warrantyYears+1..lifetime: income + expense.
 * - Expense amount = opexValue × expensePercent / 100 (default 80%).
 */
export function opexScheduleDrafts(opts: {
  opexValue: number;
  opexExpensePercent?: number | null;
  warrantyYears?: number | null;
  systemLifetimeYears: number;
  installCompleteDate: string;
}): OpexScheduleDraftsResult {
  const opexValue = opts.opexValue;
  if (!(opexValue > 0)) {
    return { ok: false, error: "Set a yearly OPEX income value first." };
  }
  const lifetime = Math.floor(opts.systemLifetimeYears);
  if (!(lifetime > 0)) {
    return {
      ok: false,
      error: "Set system lifetime years (at least 1).",
    };
  }
  const warranty = Math.max(
    0,
    Math.floor(opts.warrantyYears ?? 0),
  );
  const expensePercent =
    opts.opexExpensePercent != null &&
    Number.isFinite(opts.opexExpensePercent) &&
    opts.opexExpensePercent >= 0
      ? opts.opexExpensePercent
      : DEFAULT_OPEX_EXPENSE_PERCENT;
  const expenseAmount =
    Math.round(((opexValue * expensePercent) / 100) * 100) / 100;
  const expenseExVat = amountExFromInc(expenseAmount);

  const incomes: OpexIncomeDraft[] = [];
  const expenses: OpexExpenseDraft[] = [];

  for (let year = 1; year <= lifetime; year += 1) {
    const dueDate = addCalendarYears(opts.installCompleteDate, year);
    const inWarranty = year <= warranty;
    expenses.push({
      amount: expenseAmount,
      amountExVat: expenseExVat,
      percent: expensePercent,
      dueDate,
      label: inWarranty
        ? `OPEX · Year ${year} (warranty)`
        : `OPEX · Year ${year}`,
      yearIndex: year,
    });
    if (!inWarranty) {
      incomes.push({
        amount: opexValue,
        dueDate,
        label: `OPEX · Year ${year}`,
        yearIndex: year,
      });
    }
  }

  return {
    ok: true,
    drafts: {
      incomes,
      expenses,
      installCompleteDate: opts.installCompleteDate,
      expensePercent,
    },
  };
}
