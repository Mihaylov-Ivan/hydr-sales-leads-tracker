/**
 * Build / download finance2.xlsx
 *
 * Sheet "Data":
 *   Project | Date | Income | Expense | Deadline | Category | Subcategory
 *
 * Sheet "Company":
 *   Month | Fixed monthly | Status
 *
 * Sheet "Projects":
 *   Project | Max Materials | Max Man-hr
 *
 * Category: materials | man-hr | installation
 * Subcategory (installation): fuel | tickets | hotels | travel-allowance |
 *   installation-equipment
 */

import * as XLSX from "xlsx";
import { FinanceImportData } from "./finance-import";
import { projectsWithMergedFinancials } from "./finance-merge";
import {
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "./gantt-finance";
import {
  CompanyFinanceSettings,
  Project,
  companyMonthlyCashTotal,
  inferExpenseCategory,
  normalizeCompanyMonthlyExpense,
  normalizeProjectExpense,
  todayDate,
} from "./types";

export type FinanceExportRow = {
  project: string;
  /** yyyy-mm-dd */
  date: string;
  income: number;
  expense: number;
  deadline: string;
  /** Expense type; empty for income-only rows */
  category: string;
  /** Installation subcategory; empty otherwise */
  subcategory: string;
};

export type ProjectCapsExportRow = {
  project: string;
  maxMaterials: number | "";
  maxManHr: number | "";
};

/**
 * Flatten merged project financials into finance2 Data sheet rows.
 * Same project+date+deadline+category+subcategory collapses amounts onto one row.
 */
export function buildFinanceExportRows(
  projects: Project[],
  importData: FinanceImportData | null,
  today: string = todayDate(),
): FinanceExportRow[] {
  const merged = projectsWithMergedFinancials(projects, importData, today);
  type Agg = { income: number; expense: number };
  const map = new Map<string, Agg>();

  function key(
    project: string,
    date: string,
    deadline: string,
    category: string,
    subcategory: string,
  ): string {
    return `${project}\0${date}\0${deadline}\0${category}\0${subcategory}`;
  }

  function bump(
    project: string,
    date: string,
    deadline: string,
    kind: "income" | "expense",
    amount: number,
    category: string,
    subcategory: string,
  ) {
    if (amount <= 0 || !project || !date) return;
    const cat = kind === "expense" ? category : "";
    const sub = kind === "expense" ? subcategory : "";
    const k = key(project, date, deadline, cat, sub);
    const cur = map.get(k) ?? { income: 0, expense: 0 };
    if (kind === "income") cur.income += amount;
    else cur.expense += amount;
    map.set(k, cur);
  }

  for (const p of merged) {
    const f = p.financials;
    const deadlines = projectLinkableDeadlines(p);
    for (const pay of f.payments ?? []) {
      const linked = findLinkableDeadline(pay.milestoneId, deadlines);
      const date = pay.actualDate ?? linked?.date ?? pay.dueDate;
      const deadline = pay.label?.trim() || linked?.label || "";
      bump(p.name, date, deadline, "income", pay.amount, "", "");
    }
    for (const raw of f.expenseSchedule ?? []) {
      const exp = normalizeProjectExpense(raw);
      const linked = findLinkableDeadline(exp.milestoneId, deadlines);
      const date = exp.actualDate ?? linked?.date ?? exp.dueDate;
      const deadline = exp.label?.trim() || linked?.label || "";
      const category = exp.category ?? inferExpenseCategory(exp.label);
      const subcategory =
        category === "installation" && exp.subcategory ? exp.subcategory : "";
      bump(p.name, date, deadline, "expense", exp.amount, category, subcategory);
    }
  }

  const rows: FinanceExportRow[] = [];
  for (const [k, agg] of map) {
    const [project, date, deadline, category, subcategory] = k.split("\0");
    rows.push({
      project,
      date,
      income: agg.income,
      expense: agg.expense,
      deadline,
      category: category ?? "",
      subcategory: subcategory ?? "",
    });
  }

  return rows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const p = a.project.localeCompare(b.project);
    if (p !== 0) return p;
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.subcategory.localeCompare(b.subcategory);
  });
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function buildCompanyExportRows(
  financeSettings: CompanyFinanceSettings,
): { month: string; fixedMonthly: number; status: string }[] {
  return (financeSettings.monthlyExpenses ?? [])
    .map(normalizeCompanyMonthlyExpense)
    .filter((e): e is NonNullable<typeof e> => e != null)
    .filter((e) => companyMonthlyCashTotal(e) > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((e) => ({
      month: e.month,
      fixedMonthly: e.fixedMonthly,
      status: e.status,
    }));
}

/** One row per project that has max Materials and/or max Man-hr set. */
export function buildProjectCapsExportRows(
  projects: Project[],
): ProjectCapsExportRow[] {
  return projects
    .map((p) => {
      const f = p.financials;
      const maxMaterials =
        f.maxMaterialsExpense != null && f.maxMaterialsExpense > 0
          ? f.maxMaterialsExpense
          : ("" as const);
      const maxManHr =
        f.maxManHrExpense != null && f.maxManHrExpense > 0
          ? f.maxManHrExpense
          : ("" as const);
      if (maxMaterials === "" && maxManHr === "") return null;
      return {
        project: p.name,
        maxMaterials,
        maxManHr,
      };
    })
    .filter((r): r is ProjectCapsExportRow => r != null)
    .sort((a, b) => a.project.localeCompare(b.project));
}

export function buildFinanceWorkbook(
  rows: FinanceExportRow[],
  companyRows: { month: string; fixedMonthly: number; status: string }[] = [],
  projectCapsRows: ProjectCapsExportRow[] = [],
): XLSX.WorkBook {
  const dataAoa: (string | number | Date)[][] = [
    ["Project", "Date", "Income", "Expense", "Deadline", "Category", "Subcategory"],
    ...rows.map((r) => [
      r.project,
      isoToLocalDate(r.date),
      r.income,
      r.expense,
      r.deadline,
      r.category,
      r.subcategory,
    ]),
  ];
  const dataSheet = XLSX.utils.aoa_to_sheet(dataAoa);
  const dataRange = XLSX.utils.decode_range(dataSheet["!ref"] ?? "A1");
  for (let R = 1; R <= dataRange.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 1 });
    const cell = dataSheet[addr];
    if (cell && cell.t === "d") {
      cell.z = "yyyy-mm-dd";
    }
  }

  const companyAoa: (string | number)[][] = [
    ["Month", "Fixed monthly", "Status"],
    ...companyRows.map((r) => [r.month, r.fixedMonthly, r.status]),
  ];
  const companySheet = XLSX.utils.aoa_to_sheet(companyAoa);

  const projectsAoa: (string | number)[][] = [
    ["Project", "Max Materials", "Max Man-hr"],
    ...projectCapsRows.map((r) => [r.project, r.maxMaterials, r.maxManHr]),
  ];
  const projectsSheet = XLSX.utils.aoa_to_sheet(projectsAoa);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dataSheet, "Data");
  XLSX.utils.book_append_sheet(wb, companySheet, "Company");
  XLSX.utils.book_append_sheet(wb, projectsSheet, "Projects");
  return wb;
}

/** Trigger a browser download of finance2-style workbook. */
export function downloadFinanceWorkbook(
  projects: Project[],
  importData: FinanceImportData | null,
  filename = "finance2.xlsx",
  financeSettings?: CompanyFinanceSettings | null,
): { rowCount: number } {
  const rows = buildFinanceExportRows(projects, importData);
  const companyRows = financeSettings
    ? buildCompanyExportRows(financeSettings)
    : [];
  const projectCapsRows = buildProjectCapsExportRows(projects);
  const wb = buildFinanceWorkbook(rows, companyRows, projectCapsRows);
  XLSX.writeFile(wb, filename);
  return {
    rowCount: rows.length + companyRows.length + projectCapsRows.length,
  };
}
