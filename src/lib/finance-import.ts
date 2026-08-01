/**
 * Finance import from a single Excel sheet (finance2.xlsx style).
 *
 * Sheet "Data" columns:
 *   Project | Date | Income | Expense | Deadline
 *
 * Date ≤ today → actual (past cash).
 * Date > today → expected (from file; merged at read time, not stored in project financials).
 */

import * as XLSX from "xlsx";
import {
  CompanyFinanceSettings,
  CompanyMonthlyExpense,
  MilestoneKind,
  MILESTONE_KINDS,
  MILESTONE_LABELS,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  todayDate,
} from "./types";

export type ImportedCompanyMonth = {
  month: string;
  incomeAmount: number;
  expenseAmount: number;
  notes?: string;
};

export type ImportedProjectActual = {
  /** Match against project.name (case-insensitive trim) */
  projectName: string;
  type: "income" | "expense";
  amount: number;
  /** Set for past/current months (actual cash). Omit for future expected. */
  actualDate?: string;
  dueDate: string;
  label?: string;
  percent?: number;
  /** Deadline tag from Excel (FAT / SAT / …) */
  deadline?: string;
};

export type ImportedProjectMilestone = {
  projectName: string;
  kind: MilestoneKind;
  date: string;
  label?: string;
};

export type FinanceImportData = {
  importedAt: string;
  sourceLabel: string;
  /** @deprecated No longer used by finance2 single-sheet format */
  companyMonths: ImportedCompanyMonth[];
  /** Past actuals only (have actualDate) */
  projectActuals: ImportedProjectActual[];
  /** Future expected rows from Excel (no actualDate) */
  projectExpected: ImportedProjectActual[];
  projectMilestones: ImportedProjectMilestone[];
  openingCash?: number;
  openingCashAsOf?: string;
};

export type FinanceImportParseResult =
  | { ok: true; data: FinanceImportData }
  | { ok: false; error: string };

function headerIndex(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) =>
    h.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, ""),
  );
  for (const name of names) {
    const needle = name.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
    const i = lower.indexOf(needle);
    if (i >= 0) return i;
  }
  return -1;
}

function num(raw: string | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Normalize Excel/cell values to yyyy-mm-dd (calendar date). */
function parseToIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-15`;
  // ISO datetime from SheetJS Date serialization
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return iso[1];
  // M/D/YY or M/D/YYYY (Excel en-US display)
  const mdy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (mdy) {
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    const mo = Number(mdy[1]);
    const d = Number(mdy[2]);
    // If day>12, treat as D/M/Y; if month>12 impossible in first slot so M/D/Y;
    // Prefer M/D/Y for Excel US; if mo>12 swap (D/M/Y).
    if (mo > 12) {
      return `${y}-${String(d).padStart(2, "0")}-${String(mo).padStart(2, "0")}`;
    }
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function cellToString(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel date-only cells often deserialize as UTC near previous local midnight.
    // Shift +12h then take UTC Y-M-D so 2/15/26 stays 2026-02-15.
    const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const d = String(shifted.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Plain numbers must stay numeric — do not treat 45000 as an Excel date serial.
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}

function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  return data
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return cells.map((c) => cellToString(c));
    })
    .filter((row) => row.some((c) => c.length > 0));
}

function findDataSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  const exact = wb.SheetNames.find((n) => n.trim().toLowerCase() === "data");
  if (exact) return wb.Sheets[exact] ?? null;

  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[name]!);
    if (rows.length < 1) continue;
    const headers = rows[0];
    const hasProject = headerIndex(headers, "project", "project_name") >= 0;
    const hasMonth =
      headerIndex(headers, "date", "month", "due_date") >= 0;
    const hasIncome = headerIndex(headers, "income") >= 0;
    const hasExpense = headerIndex(headers, "expense", "expenses") >= 0;
    if (hasProject && hasMonth && (hasIncome || hasExpense)) {
      return wb.Sheets[name] ?? null;
    }
  }
  return wb.SheetNames[0] ? (wb.Sheets[wb.SheetNames[0]] ?? null) : null;
}

/** Map Excel Deadline text → milestone kind */
export function deadlineToKind(raw: string): MilestoneKind | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (t === "fat") return "fat";
  if (t === "sat") return "sat";
  if (t.includes("engineering")) return "engineering-done";
  if (t.includes("manufacturing")) return "manufacturing-done";
  if (t.includes("commission")) return "commissioned";
  if (t.includes("contract")) return "contract-signed";
  for (const kind of MILESTONE_KINDS) {
    if (MILESTONE_LABELS[kind].toLowerCase() === t) return kind;
  }
  return null;
}

export function parseFinanceDataRows(
  rows: string[][],
  today: string = todayDate(),
): {
  actuals: ImportedProjectActual[];
  expected: ImportedProjectActual[];
  milestones: ImportedProjectMilestone[];
  error?: string;
} {
  if (rows.length < 1) {
    return {
      actuals: [],
      expected: [],
      milestones: [],
      error: "Sheet is empty",
    };
  }
  const headers = rows[0];
  const iProject = headerIndex(headers, "project", "project_name", "name");
  const iDate = headerIndex(headers, "date", "month", "due_date");
  const iIncome = headerIndex(headers, "income", "income_amount");
  const iExpense = headerIndex(
    headers,
    "expense",
    "expenses",
    "expense_amount",
  );
  const iDeadline = headerIndex(headers, "deadline", "milestone", "label");

  if (iProject < 0 || iDate < 0) {
    return {
      actuals: [],
      expected: [],
      milestones: [],
      error: "Sheet needs Project and Date columns",
    };
  }
  if (iIncome < 0 && iExpense < 0) {
    return {
      actuals: [],
      expected: [],
      milestones: [],
      error: "Sheet needs Income and/or Expense columns",
    };
  }

  const actuals: ImportedProjectActual[] = [];
  const expected: ImportedProjectActual[] = [];
  const milestoneKeys = new Set<string>();
  const milestones: ImportedProjectMilestone[] = [];

  function pushLine(
    projectName: string,
    type: "income" | "expense",
    amount: number,
    date: string,
    deadline: string | undefined,
    isActual: boolean,
  ) {
    const line: ImportedProjectActual = {
      projectName,
      type,
      amount,
      dueDate: date,
      ...(isActual ? { actualDate: date } : {}),
      ...(deadline ? { label: deadline, deadline } : {}),
    };
    if (isActual) actuals.push(line);
    else expected.push(line);
  }

  for (const r of rows.slice(1)) {
    const projectName = (r[iProject] ?? "").trim();
    const date = parseToIsoDate(r[iDate] ?? "");
    if (!projectName || !date) continue;

    const income = iIncome >= 0 ? Math.max(0, num(r[iIncome])) : 0;
    const expense = iExpense >= 0 ? Math.max(0, num(r[iExpense])) : 0;
    const deadline =
      iDeadline >= 0 && r[iDeadline] ? r[iDeadline].trim() : undefined;
    const isActual = date <= today;

    if (income > 0) {
      pushLine(projectName, "income", income, date, deadline, isActual);
    }
    if (expense > 0) {
      pushLine(projectName, "expense", expense, date, deadline, isActual);
    }

    if (deadline) {
      const kind = deadlineToKind(deadline);
      if (kind) {
        const key = `${projectName.toLowerCase()}|${kind}|${date}`;
        if (!milestoneKeys.has(key)) {
          milestoneKeys.add(key);
          milestones.push({
            projectName,
            kind,
            date,
            label: deadline,
          });
        }
      }
    }
  }

  return { actuals, expected, milestones };
}

export function parseFinanceWorkbook(
  buffer: ArrayBuffer,
  sourceLabel: string,
  today: string = todayDate(),
): FinanceImportParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return { ok: false, error: "Could not read Excel file" };
  }

  const sheet = findDataSheet(wb);
  if (!sheet) {
    return { ok: false, error: "Workbook has no sheets" };
  }

  const parsed = parseFinanceDataRows(sheetToRows(sheet), today);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (parsed.actuals.length === 0 && parsed.expected.length === 0) {
    return { ok: false, error: "No income/expense rows found in the sheet" };
  }

  const months = [
    ...new Set(
      [...parsed.actuals, ...parsed.expected].map((a) => a.dueDate.slice(0, 7)),
    ),
  ].sort();

  return {
    ok: true,
    data: {
      importedAt: new Date().toISOString(),
      sourceLabel,
      companyMonths: [],
      projectActuals: parsed.actuals,
      projectExpected: parsed.expected,
      projectMilestones: parsed.milestones,
      ...(months[0] ? { openingCashAsOf: months[0] } : {}),
    },
  };
}

export function buildFinanceImport(
  _companyCsv: string,
  _projectCsv: string,
  sourceLabel: string,
): FinanceImportParseResult {
  return {
    ok: false,
    error: `Use a single Excel file (finance2.xlsx). Legacy CSV import removed (${sourceLabel}).`,
  };
}

export function companyExpensesFromImport(
  _data: FinanceImportData,
): CompanyMonthlyExpense[] {
  return [];
}

export function companyIncomesFromImport(
  _data: FinanceImportData,
): { month: string; amount: number }[] {
  return [];
}

export function matchProjectName(
  projects: { id: string; name: string }[],
  name: string,
): string | null {
  const needle = name.trim().toLowerCase();
  const exact = projects.find((p) => p.name.trim().toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = projects.find((p) =>
    p.name.trim().toLowerCase().includes(needle),
  );
  return partial?.id ?? null;
}

function nameMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function projectActualPaymentsFromImport(
  data: FinanceImportData,
  projectId: string,
  projectName: string,
): ProjectPayment[] {
  return data.projectActuals
    .filter((a) => a.type === "income" && nameMatch(a.projectName, projectName))
    .map((a, i) => ({
      id: `import-pay-${projectId}-${a.dueDate}-${i}`,
      amount: a.amount,
      dueDate: a.dueDate,
      ...(a.actualDate ? { actualDate: a.actualDate } : {}),
      ...(a.label ? { label: a.label } : {}),
      ...(a.percent != null ? { percent: a.percent } : {}),
      createdAt: data.importedAt,
    }));
}

export function projectActualExpensesFromImport(
  data: FinanceImportData,
  projectId: string,
  projectName: string,
): ProjectExpenseItem[] {
  return data.projectActuals
    .filter(
      (a) => a.type === "expense" && nameMatch(a.projectName, projectName),
    )
    .map((a, i) => ({
      id: `import-exp-${projectId}-${a.dueDate}-${i}`,
      amount: a.amount,
      dueDate: a.dueDate,
      ...(a.actualDate ? { actualDate: a.actualDate } : {}),
      ...(a.label ? { label: a.label } : {}),
      ...(a.percent != null ? { percent: a.percent } : {}),
      createdAt: data.importedAt,
    }));
}

export function projectMilestonesFromImport(
  data: FinanceImportData,
  projectId: string,
  projectName: string,
): ProjectMilestone[] {
  return (data.projectMilestones ?? [])
    .filter((m) => nameMatch(m.projectName, projectName))
    .map((m, i) => ({
      id: `import-ms-${projectId}-${m.kind}-${m.date}-${i}`,
      kind: m.kind,
      date: m.date,
      ...(m.label ? { note: m.label } : {}),
      createdAt: data.importedAt,
    }));
}

/** Ids created from Excel import — must not live in app local financials. */
export function isFileOwnedFinanceId(id: string): boolean {
  return (
    id.startsWith("import-") ||
    id.startsWith("expect-")
  );
}

/**
 * Keep only app-entered schedules/summaries for localStorage.
 * Excel actuals/expected stay in financeImport and are merged at read time.
 */
export function sanitizeAppFinancials(
  f: ProjectFinancials,
): ProjectFinancials {
  return {
    ...f,
    payments: (f.payments ?? []).filter((p) => !isFileOwnedFinanceId(p.id)),
    expenseSchedule: (f.expenseSchedule ?? []).filter(
      (e) => !isFileOwnedFinanceId(e.id),
    ),
    milestones: (f.milestones ?? []).filter((m) => !isFileOwnedFinanceId(m.id)),
  };
}

/** Future expected lines from Excel (no actualDate) as schedule items */
export function expectedSchedulesForProject(
  data: FinanceImportData,
  projectId: string,
  projectName: string,
): { payments: ProjectPayment[]; expenses: ProjectExpenseItem[] } {
  const expected = data.projectExpected ?? [];
  const payments = expected
    .filter((a) => a.type === "income" && nameMatch(a.projectName, projectName))
    .map((a, i) => ({
      id: `expect-pay-${projectId}-${a.dueDate}-${i}`,
      amount: a.amount,
      dueDate: a.dueDate,
      ...(a.label ? { label: a.label } : {}),
      createdAt: data.importedAt,
    }));
  const expenses = expected
    .filter(
      (a) => a.type === "expense" && nameMatch(a.projectName, projectName),
    )
    .map((a, i) => ({
      id: `expect-exp-${projectId}-${a.dueDate}-${i}`,
      amount: a.amount,
      dueDate: a.dueDate,
      ...(a.label ? { label: a.label } : {}),
      createdAt: data.importedAt,
    }));
  return { payments, expenses };
}

/**
 * After import: clear company projected opex to 0 (manual entry only),
 * set opening as-of to earliest month in the file.
 */
export function settingsAfterImport(
  prev: CompanyFinanceSettings,
  data: FinanceImportData,
): CompanyFinanceSettings {
  const months = [
    ...data.projectActuals.map((a) => a.dueDate.slice(0, 7)),
    ...(data.projectExpected ?? []).map((a) => a.dueDate.slice(0, 7)),
    ...data.companyMonths.map((m) => m.month),
  ]
    .filter(Boolean)
    .sort();
  const earliest = data.openingCashAsOf ?? months[0];

  return {
    ...prev,
    openingCash: data.openingCash ?? prev.openingCash,
    ...(earliest ? { openingCashAsOf: earliest } : {}),
    monthlyExpenses: [],
  };
}

export function isFutureDate(iso: string, today: string = todayDate()): boolean {
  return iso > today;
}
