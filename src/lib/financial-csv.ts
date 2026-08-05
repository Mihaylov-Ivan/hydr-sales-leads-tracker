/**
 * Round-trip CSV for project + company financial data (local “financial DB”).
 *
 * Fixed columns so Excel / Sheets can edit and re-import.
 * `type` discriminates rows:
 *   - project       — contract totals for one project
 *   - payment       — income line
 *   - expense       — expense schedule line
 *   - milestone     — financial timeline milestone
 *   - company       — opening cash / WC / win probabilities (one row)
 *   - company_opex  — company fixed monthly cost
 */

import { sanitizeAppFinancials } from "./finance-import";
import {
  CompanyFinanceSettings,
  CompanyMonthlyExpense,
  CompanyMonthlyExpenseStatus,
  MilestoneKind,
  MILESTONE_KINDS,
  Project,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  companyMonthlyCashTotal,
  defaultFinanceSettings,
  emptyFinancials,
  inferExpenseCategory,
  isProjectExpenseCategory,
  normalizeCompanyMonthlyExpense,
} from "./types";

export const FINANCIAL_CSV_HEADERS = [
  "type",
  "project_id",
  "project_name",
  "id",
  "label",
  "amount",
  "percent",
  "due_date",
  "actual_date",
  "milestone_id",
  "created_at",
  "contract_value",
  "contract_signed_date",
  "expenses",
  "expected_profit",
  "max_materials_expense",
  "max_man_hr_expense",
  "milestone_kind",
  "milestone_note",
  "month",
  "status",
  "opening_cash",
  "opening_cash_as_of",
  "min_working_capital",
  "prob_cold_lead",
  "prob_hot_lead",
  "prob_under_development",
  "prob_commissioned",
  "fixed_monthly",
  "category",
] as const;

export type FinancialCsvHeader = (typeof FINANCIAL_CSV_HEADERS)[number];

type CsvRow = Record<FinancialCsvHeader, string>;

export type FinancialCsvBundle = {
  byProjectId: Record<string, ProjectFinancials>;
  /** project_name (lower) → financials when id unknown */
  byProjectName: Record<string, ProjectFinancials>;
  financeSettings: CompanyFinanceSettings | null;
};

function escCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function emptyRow(): CsvRow {
  return Object.fromEntries(
    FINANCIAL_CSV_HEADERS.map((h) => [h, ""]),
  ) as CsvRow;
}

function rowLine(row: CsvRow): string {
  return FINANCIAL_CSV_HEADERS.map((h) => escCell(row[h])).join(",");
}

function numStr(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "" : String(n);
}

/**
 * Build CSV text from live projects + company finance settings.
 */
export function buildFinancialCsv(
  projects: Project[],
  financeSettings: CompanyFinanceSettings,
): string {
  const lines: string[] = [FINANCIAL_CSV_HEADERS.join(",")];

  const company = emptyRow();
  company.type = "company";
  company.opening_cash = numStr(financeSettings.openingCash);
  company.opening_cash_as_of = financeSettings.openingCashAsOf ?? "";
  company.min_working_capital = numStr(financeSettings.minWorkingCapital);
  company.prob_cold_lead = numStr(
    financeSettings.stageProbabilities["cold-lead"],
  );
  company.prob_hot_lead = numStr(
    financeSettings.stageProbabilities["hot-lead"],
  );
  company.prob_under_development = numStr(
    financeSettings.stageProbabilities["under-development"],
  );
  company.prob_commissioned = numStr(
    financeSettings.stageProbabilities.commissioned,
  );
  lines.push(rowLine(company));

  for (const opex of financeSettings.monthlyExpenses ?? []) {
    const r = emptyRow();
    r.type = "company_opex";
    r.month = opex.month;
    r.fixed_monthly = numStr(opex.fixedMonthly);
    r.amount = numStr(companyMonthlyCashTotal(opex));
    r.status = opex.status;
    lines.push(rowLine(r));
  }

  for (const p of projects) {
    const f = sanitizeAppFinancials(p.financials ?? emptyFinancials());
    const base = emptyRow();
    base.type = "project";
    base.project_id = p.id;
    base.project_name = p.name;
    base.contract_value = numStr(f.contractValue);
    base.contract_signed_date = f.contractSignedDate ?? "";
    base.expenses = numStr(f.expenses);
    base.expected_profit = numStr(f.expectedProfit);
    base.max_materials_expense = numStr(f.maxMaterialsExpense);
    base.max_man_hr_expense = numStr(f.maxManHrExpense);
    lines.push(rowLine(base));

    for (const pay of f.payments) {
      const r = emptyRow();
      r.type = "payment";
      r.project_id = p.id;
      r.project_name = p.name;
      r.id = pay.id;
      r.label = pay.label ?? "";
      r.amount = numStr(pay.amount);
      r.percent = numStr(pay.percent);
      r.due_date = pay.dueDate ?? "";
      r.actual_date = pay.actualDate ?? "";
      r.milestone_id = pay.milestoneId ?? "";
      r.created_at = pay.createdAt ?? "";
      lines.push(rowLine(r));
    }

    for (const exp of f.expenseSchedule ?? []) {
      const r = emptyRow();
      r.type = "expense";
      r.project_id = p.id;
      r.project_name = p.name;
      r.id = exp.id;
      r.label = exp.label ?? "";
      r.amount = numStr(exp.amount);
      r.percent = numStr(exp.percent);
      r.due_date = exp.dueDate ?? "";
      r.actual_date = exp.actualDate ?? "";
      r.milestone_id = exp.milestoneId ?? "";
      r.created_at = exp.createdAt ?? "";
      r.category = exp.category ?? inferExpenseCategory(exp.label);
      lines.push(rowLine(r));
    }

    for (const m of f.milestones ?? []) {
      const r = emptyRow();
      r.type = "milestone";
      r.project_id = p.id;
      r.project_name = p.name;
      r.id = m.id;
      r.due_date = m.date ?? "";
      r.created_at = m.createdAt ?? "";
      r.milestone_kind = m.kind;
      r.milestone_note = m.note ?? "";
      lines.push(rowLine(r));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

export function downloadFinancialCsv(
  projects: Project[],
  financeSettings: CompanyFinanceSettings,
  filename = `financial-data-${new Date().toISOString().slice(0, 10)}.csv`,
): void {
  const csv = buildFinancialCsv(projects, financeSettings);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Minimal RFC4180-ish parser (quoted fields, commas, newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseRequiredNumber(raw: string, fallback = 0): number {
  return parseOptionalNumber(raw) ?? fallback;
}

function isMilestoneKind(v: string): v is MilestoneKind {
  return (MILESTONE_KINDS as string[]).includes(v);
}

/**
 * Parse financial CSV into a bundle ready to apply onto live projects.
 */
export function parseFinancialCsv(text: string):
  | {
      ok: true;
      data: FinancialCsvBundle;
    }
  | { ok: false; error: string } {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { ok: false, error: "CSV is empty." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: FinancialCsvHeader) => header.indexOf(name);
  if (idx("type") < 0) {
    return {
      ok: false,
      error: `Missing required column "type". Expected headers: ${FINANCIAL_CSV_HEADERS.join(", ")}`,
    };
  }

  const cell = (row: string[], name: FinancialCsvHeader): string => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  const byId = new Map<string, ProjectFinancials>();
  const byName = new Map<string, ProjectFinancials>();
  let financeSettings: CompanyFinanceSettings | null = null;
  const opex: CompanyMonthlyExpense[] = [];

  function touch(row: string[]): ProjectFinancials | null {
    const id = cell(row, "project_id");
    const nameKey = cell(row, "project_name").toLowerCase();
    if (!id && !nameKey) return null;

    let f: ProjectFinancials | undefined;
    if (id) f = byId.get(id);
    if (!f && nameKey) f = byName.get(nameKey);
    if (!f) f = emptyFinancials();

    if (id) byId.set(id, f);
    if (nameKey) byName.set(nameKey, f);
    return f;
  }

  for (const row of rows.slice(1)) {
    const type = cell(row, "type").toLowerCase();
    if (!type) continue;

    if (type === "company") {
      const base = defaultFinanceSettings();
      financeSettings = {
        openingCash: parseRequiredNumber(cell(row, "opening_cash"), 0),
        openingCashAsOf: cell(row, "opening_cash_as_of") || undefined,
        minWorkingCapital: parseRequiredNumber(
          cell(row, "min_working_capital"),
          0,
        ),
        stageProbabilities: {
          ...base.stageProbabilities,
          "cold-lead":
            parseOptionalNumber(cell(row, "prob_cold_lead")) ??
            base.stageProbabilities["cold-lead"],
          "hot-lead":
            parseOptionalNumber(cell(row, "prob_hot_lead")) ??
            base.stageProbabilities["hot-lead"],
          "under-development":
            parseOptionalNumber(cell(row, "prob_under_development")) ??
            base.stageProbabilities["under-development"],
          commissioned:
            parseOptionalNumber(cell(row, "prob_commissioned")) ??
            base.stageProbabilities.commissioned,
        },
        monthlyExpenses: [],
      };
      continue;
    }

    if (type === "company_opex") {
      const month = cell(row, "month");
      const statusRaw = cell(row, "status") || "projected";
      const status: CompanyMonthlyExpenseStatus =
        statusRaw === "actual" ? "actual" : "projected";

      let fixedMonthly = parseOptionalNumber(cell(row, "fixed_monthly"));
      if (fixedMonthly == null) {
        const salaryIdx = header.indexOf("salary");
        const otherIdx = header.indexOf("other");
        const salary =
          salaryIdx >= 0
            ? parseOptionalNumber(row[salaryIdx] ?? "")
            : undefined;
        const other =
          otherIdx >= 0
            ? (parseOptionalNumber(row[otherIdx] ?? "") ?? 0)
            : 0;
        if (salary != null || other > 0) {
          fixedMonthly = (salary ?? 0) + other;
        } else {
          fixedMonthly = parseOptionalNumber(cell(row, "amount"));
        }
      }

      const normalized = normalizeCompanyMonthlyExpense({
        month,
        fixedMonthly: fixedMonthly ?? 0,
        status,
        ...(fixedMonthly == null
          ? { amount: parseOptionalNumber(cell(row, "amount")) ?? 0 }
          : {}),
      });
      if (normalized) opex.push(normalized);
      continue;
    }

    if (type === "project") {
      const f = touch(row);
      if (!f) continue;
      const cv = parseOptionalNumber(cell(row, "contract_value"));
      const ex = parseOptionalNumber(cell(row, "expenses"));
      const ep = parseOptionalNumber(cell(row, "expected_profit"));
      const signed = cell(row, "contract_signed_date");
      const maxMat = parseOptionalNumber(cell(row, "max_materials_expense"));
      const maxMan = parseOptionalNumber(cell(row, "max_man_hr_expense"));
      if (cv !== undefined) f.contractValue = cv;
      if (ex !== undefined) f.expenses = ex;
      if (ep !== undefined) f.expectedProfit = ep;
      else if (cv !== undefined && ex !== undefined) f.expectedProfit = cv - ex;
      if (signed) f.contractSignedDate = signed;
      if (maxMat !== undefined) f.maxMaterialsExpense = maxMat;
      if (maxMan !== undefined) f.maxManHrExpense = maxMan;
      continue;
    }

    if (type === "payment") {
      const f = touch(row);
      if (!f) continue;
      const amount = parseOptionalNumber(cell(row, "amount"));
      const dueDate = cell(row, "due_date");
      if (amount == null || !dueDate) continue;
      const payment: ProjectPayment = {
        id: cell(row, "id") || crypto.randomUUID(),
        amount,
        dueDate,
        createdAt: cell(row, "created_at") || new Date().toISOString(),
      };
      const percent = parseOptionalNumber(cell(row, "percent"));
      if (percent !== undefined) payment.percent = percent;
      const actual = cell(row, "actual_date");
      if (actual) payment.actualDate = actual;
      const label = cell(row, "label");
      if (label) payment.label = label;
      const mid = cell(row, "milestone_id");
      if (mid) payment.milestoneId = mid;
      f.payments.push(payment);
      continue;
    }

    if (type === "expense") {
      const f = touch(row);
      if (!f) continue;
      const amount = parseOptionalNumber(cell(row, "amount"));
      const dueDate = cell(row, "due_date");
      if (amount == null || !dueDate) continue;
      const expense: ProjectExpenseItem = {
        id: cell(row, "id") || crypto.randomUUID(),
        amount,
        dueDate,
        createdAt: cell(row, "created_at") || new Date().toISOString(),
      };
      const percent = parseOptionalNumber(cell(row, "percent"));
      if (percent !== undefined) expense.percent = percent;
      const actual = cell(row, "actual_date");
      if (actual) expense.actualDate = actual;
      const label = cell(row, "label");
      if (label) expense.label = label;
      const mid = cell(row, "milestone_id");
      if (mid) expense.milestoneId = mid;
      const categoryRaw = cell(row, "category");
      expense.category = isProjectExpenseCategory(categoryRaw)
        ? categoryRaw
        : inferExpenseCategory(label);
      f.expenseSchedule.push(expense);
      continue;
    }

    if (type === "milestone") {
      const f = touch(row);
      if (!f) continue;
      const kindRaw = cell(row, "milestone_kind");
      const date = cell(row, "due_date");
      if (!date || !isMilestoneKind(kindRaw)) continue;
      const milestone: ProjectMilestone = {
        id: cell(row, "id") || crypto.randomUUID(),
        kind: kindRaw,
        date,
        createdAt: cell(row, "created_at") || new Date().toISOString(),
      };
      const note = cell(row, "milestone_note");
      if (note) milestone.note = note;
      f.milestones.push(milestone);
      continue;
    }
  }

  if (financeSettings) {
    financeSettings = {
      ...financeSettings,
      monthlyExpenses: opex.sort((a, b) => a.month.localeCompare(b.month)),
    };
  } else if (opex.length > 0) {
    financeSettings = {
      ...defaultFinanceSettings(),
      monthlyExpenses: opex.sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  const byProjectId: Record<string, ProjectFinancials> = {};
  for (const [id, f] of byId) {
    byProjectId[id] = sanitizeAppFinancials(f);
  }
  const byProjectName: Record<string, ProjectFinancials> = {};
  for (const [name, f] of byName) {
    byProjectName[name] = sanitizeAppFinancials(f);
  }

  return {
    ok: true,
    data: { byProjectId, byProjectName, financeSettings },
  };
}

/**
 * Merge CSV bundle onto projects. Projects present in the CSV get their
 * financials replaced; others are left unchanged.
 */
export function applyFinancialCsvBundle(
  projects: Project[],
  bundle: FinancialCsvBundle,
): Project[] {
  return projects.map((p) => {
    const fromId = bundle.byProjectId[p.id];
    const fromName = bundle.byProjectName[p.name.toLowerCase()];
    const next = fromId ?? fromName;
    if (!next) return p;
    return { ...p, financials: sanitizeAppFinancials(next) };
  });
}
