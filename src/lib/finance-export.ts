/**
 * Build / download finance2.xlsx — Project | Date | Income | Expense | Deadline
 * Includes Excel actuals + expected + in-app future schedules.
 */

import * as XLSX from "xlsx";
import { FinanceImportData } from "./finance-import";
import { projectsWithMergedFinancials } from "./finance-merge";
import {
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "./gantt-finance";
import { Project, todayDate } from "./types";

export type FinanceExportRow = {
  project: string;
  /** yyyy-mm-dd */
  date: string;
  income: number;
  expense: number;
  deadline: string;
};

/**
 * Flatten merged project financials into finance2 sheet rows.
 * Same project+date+deadline collapses income & expense onto one row.
 */
export function buildFinanceExportRows(
  projects: Project[],
  importData: FinanceImportData | null,
  today: string = todayDate(),
): FinanceExportRow[] {
  const merged = projectsWithMergedFinancials(projects, importData, today);
  type Agg = { income: number; expense: number };
  const map = new Map<string, Agg>();

  function key(project: string, date: string, deadline: string): string {
    return `${project}\0${date}\0${deadline}`;
  }

  function bump(
    project: string,
    date: string,
    deadline: string,
    kind: "income" | "expense",
    amount: number,
  ) {
    if (amount <= 0 || !project || !date) return;
    const k = key(project, date, deadline);
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
      const deadline =
        pay.label?.trim() || linked?.label || "";
      bump(p.name, date, deadline, "income", pay.amount);
    }
    for (const exp of f.expenseSchedule ?? []) {
      const linked = findLinkableDeadline(exp.milestoneId, deadlines);
      const date = exp.actualDate ?? linked?.date ?? exp.dueDate;
      const deadline =
        exp.label?.trim() || linked?.label || "";
      bump(p.name, date, deadline, "expense", exp.amount);
    }
  }

  const rows: FinanceExportRow[] = [];
  for (const [k, agg] of map) {
    const [project, date, deadline] = k.split("\0");
    rows.push({
      project,
      date,
      income: agg.income,
      expense: agg.expense,
      deadline,
    });
  }

  return rows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.project.localeCompare(b.project);
  });
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function buildFinanceWorkbook(
  rows: FinanceExportRow[],
): XLSX.WorkBook {
  const aoa: (string | number | Date)[][] = [
    ["Project", "Date", "Income", "Expense", "Deadline"],
    ...rows.map((r) => [
      r.project,
      isoToLocalDate(r.date),
      r.income,
      r.expense,
      r.deadline,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Format date column as a real Excel date
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let R = 1; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 1 });
    const cell = sheet[addr];
    if (cell && cell.t === "d") {
      cell.z = "yyyy-mm-dd";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Data");
  return wb;
}

/** Trigger a browser download of finance2-style workbook. */
export function downloadFinanceWorkbook(
  projects: Project[],
  importData: FinanceImportData | null,
  filename = "finance2.xlsx",
): { rowCount: number } {
  const rows = buildFinanceExportRows(projects, importData);
  const wb = buildFinanceWorkbook(rows);
  XLSX.writeFile(wb, filename);
  return { rowCount: rows.length };
}
