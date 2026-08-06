/**
 * Round-trip CSV for project + company financial data (local “financial DB”).
 *
 * Fixed columns so Excel / Sheets can edit and re-import.
 * `type` discriminates rows:
 *   - project       — contract totals for one project
 *   - payment       — income line
 *   - expense       — expense schedule line (optional warehouse_lot_id)
 *   - warehouse_lot — lot unit costs / receipt meta (links to expenses via id)
 *   - milestone     — financial timeline milestone
 *   - company       — opening cash / WC / win probabilities (one row)
 *   - company_opex  — company fixed monthly cost
 *   - history       — append-only financial change snapshots (amounts OK here)
 */

import { sanitizeAppFinancials } from "./finance-import";
import {
  CompanyFinanceSettings,
  CompanyMonthlyExpense,
  CompanyMonthlyExpenseStatus,
  FinancialHistoryEntry,
  MilestoneKind,
  MILESTONE_KINDS,
  Project,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  WarehouseLot,
  WarehouseState,
  amountExFromInc,
  amountIncFromEx,
  companyMonthlyCashTotal,
  defaultFinanceSettings,
  DEFAULT_VAT_RATE,
  emptyFinancials,
  inferExpenseCategory,
  isInstallationSubcategory,
  isProjectExpenseCategory,
  normalizeCompanyMonthlyExpense,
  parseInstallationSubcategory,
  parseIsMaintenanceFlag,
  parseProjectExpenseCategory,
  parseProjectExpenseSubcategory,
} from "./types";

export const FINANCIAL_CSV_HEADERS = [
  "type",
  "project_id",
  "project_name",
  "id",
  "label",
  "amount",
  "amount_ex_vat",
  "vat_rate",
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
  "subcategory",
  "warehouse_lot_id",
  "warehouse_item_id",
  "qty",
  "is_maintenance",
  "budget_amount",
  // History rows (type=history); empty on snapshot rows
  "event_id",
  "intentional",
  "actor_user_id",
  "actor_name",
  "action",
  "field",
  "old_value",
  "new_value",
  "summary",
  "occurred_at",
  "entity_type",
  "entity_id",
] as const;

export type FinancialCsvHeader = (typeof FINANCIAL_CSV_HEADERS)[number];

type CsvRow = Record<FinancialCsvHeader, string>;

export type FinancialCsvBundle = {
  byProjectId: Record<string, ProjectFinancials>;
  /** project_name (lower) → financials when id unknown */
  byProjectName: Record<string, ProjectFinancials>;
  financeSettings: CompanyFinanceSettings | null;
  /** Append-only financial change snapshots from type=history rows */
  history: FinancialHistoryEntry[];
  /** Lot unit costs / receipt meta from type=warehouse_lot rows */
  warehouseLots: WarehouseLotCsvRow[];
};

/** Portable warehouse lot financial snapshot (CSV). */
export type WarehouseLotCsvRow = {
  lotId: string;
  itemId?: string;
  projectId?: string;
  expenseId?: string;
  unitCostIncVat: number;
  unitCostExVat: number;
  qtyReceived?: number;
  receivedAt?: string;
  category?: string;
  subcategory?: string;
  label?: string;
  createdAt?: string;
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
 * Build CSV text from live projects + company finance settings + history + warehouse lots.
 */
export function buildFinancialCsv(
  projects: Project[],
  financeSettings: CompanyFinanceSettings,
  history: FinancialHistoryEntry[] = [],
  warehouse?: Pick<WarehouseState, "lots" | "items"> | null,
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
      r.milestone_id = pay.isMaintenance ? "" : (pay.milestoneId ?? "");
      r.created_at = pay.createdAt ?? "";
      r.is_maintenance = pay.isMaintenance ? "true" : "";
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
      const exVat =
        exp.amountExVat != null && exp.amountExVat > 0
          ? exp.amountExVat
          : exp.amount > 0
            ? amountExFromInc(exp.amount)
            : undefined;
      r.amount_ex_vat = numStr(exVat);
      r.vat_rate = numStr(DEFAULT_VAT_RATE);
      r.percent = numStr(exp.percent);
      r.due_date = exp.dueDate ?? "";
      r.actual_date = exp.actualDate ?? "";
      r.milestone_id = exp.milestoneId ?? "";
      r.created_at = exp.createdAt ?? "";
      r.category = exp.category ?? inferExpenseCategory(exp.label);
      r.subcategory =
        (exp.category === "installation" || exp.category === "maintenance") &&
        exp.subcategory
          ? exp.subcategory
          : "";
      r.warehouse_lot_id = exp.warehouseLotId ?? "";
      r.budget_amount =
        exp.budgetAmount != null && exp.budgetAmount > 0
          ? numStr(exp.budgetAmount)
          : "";
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

  for (const lot of warehouse?.lots ?? []) {
    const r = emptyRow();
    r.type = "warehouse_lot";
    r.id = lot.id;
    r.warehouse_lot_id = lot.id;
    r.warehouse_item_id = lot.itemId;
    r.project_id = lot.purchaseProjectId;
    const proj = projects.find((p) => p.id === lot.purchaseProjectId);
    r.project_name = proj?.name ?? "";
    r.entity_id = lot.expenseId;
    r.amount = numStr(lot.unitCostIncVat);
    r.amount_ex_vat = numStr(lot.unitCostExVat);
    r.vat_rate = numStr(DEFAULT_VAT_RATE);
    r.qty = numStr(lot.qtyReceived);
    r.due_date = lot.receivedAt;
    r.created_at = lot.createdAt;
    r.category = lot.category;
    r.subcategory = lot.subcategory ?? "";
    r.label = lot.label ?? "";
    lines.push(rowLine(r));
  }

  const sortedHistory = [...history].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  for (const h of sortedHistory) {
    const r = emptyRow();
    r.type = "history";
    r.event_id = h.eventId;
    r.project_id = h.projectId ?? "";
    r.project_name = h.projectName ?? "";
    r.intentional = h.intentional ? "true" : "false";
    r.actor_user_id = h.actorUserId ?? "";
    r.actor_name = h.actorName ?? "";
    r.action = h.action;
    r.field = h.field ?? "";
    r.old_value = h.oldValue ?? "";
    r.new_value = h.newValue ?? "";
    r.summary = h.summary;
    r.occurred_at = h.occurredAt;
    r.entity_type = h.entityType;
    r.entity_id = h.entityId ?? "";
    r.created_at = h.occurredAt;
    lines.push(rowLine(r));
  }

  return lines.join("\r\n") + "\r\n";
}

export function downloadFinancialCsv(
  projects: Project[],
  financeSettings: CompanyFinanceSettings,
  history: FinancialHistoryEntry[] = [],
  warehouse?: Pick<WarehouseState, "lots" | "items"> | null,
  filename = `financial-data-${new Date().toISOString().slice(0, 10)}.csv`,
): void {
  const csv = buildFinancialCsv(projects, financeSettings, history, warehouse);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export only type=history rows (amounts + metadata). */
export function downloadFinancialHistoryCsv(
  history: FinancialHistoryEntry[],
  filename = `financial-history-${new Date().toISOString().slice(0, 10)}.csv`,
): void {
  const header = FINANCIAL_CSV_HEADERS.join(",");
  const body = buildFinancialCsv([], defaultFinanceSettings(), history)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("history,"));
  const out = [header, ...body].join("\r\n") + "\r\n";
  const blob = new Blob([out], { type: "text/csv;charset=utf-8" });
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
      error:
        'Missing required column "type". Older files without history columns still work; only "type" is required.',
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
  const history: FinancialHistoryEntry[] = [];
  const warehouseLots: WarehouseLotCsvRow[] = [];

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

    if (type === "history") {
      const eventId = cell(row, "event_id") || cell(row, "id");
      if (!eventId) continue;
      const entry: FinancialHistoryEntry = {
        eventId,
        occurredAt:
          cell(row, "occurred_at") ||
          cell(row, "created_at") ||
          new Date().toISOString(),
        intentional:
          cell(row, "intentional").toLowerCase() === "true" ||
          cell(row, "intentional") === "1",
        entityType: cell(row, "entity_type") || "financial",
        action: cell(row, "action") || "update",
        summary: cell(row, "summary") || "Financial change",
      };
      const actorUserId = cell(row, "actor_user_id");
      if (actorUserId) entry.actorUserId = actorUserId;
      const actorName = cell(row, "actor_name");
      if (actorName) entry.actorName = actorName;
      const projectId = cell(row, "project_id");
      if (projectId) entry.projectId = projectId;
      const projectName = cell(row, "project_name");
      if (projectName) entry.projectName = projectName;
      const entityId = cell(row, "entity_id");
      if (entityId) entry.entityId = entityId;
      const field = cell(row, "field");
      if (field) entry.field = field;
      const oldValue = cell(row, "old_value");
      if (oldValue) entry.oldValue = oldValue;
      const newValue = cell(row, "new_value");
      if (newValue) entry.newValue = newValue;
      history.push(entry);
      continue;
    }

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
      const isMaint =
        parseIsMaintenanceFlag(cell(row, "is_maintenance")) ||
        parseIsMaintenanceFlag(cell(row, "category"));
      if (isMaint) {
        payment.isMaintenance = true;
      } else {
        const mid = cell(row, "milestone_id");
        if (mid) payment.milestoneId = mid;
      }
      f.payments.push(payment);
      continue;
    }

    if (type === "expense") {
      const f = touch(row);
      if (!f) continue;
      const dueDate = cell(row, "due_date");
      let amount = parseOptionalNumber(cell(row, "amount"));
      let amountExVat = parseOptionalNumber(cell(row, "amount_ex_vat"));
      const vatRate =
        parseOptionalNumber(cell(row, "vat_rate")) ?? DEFAULT_VAT_RATE;
      if (amount == null && amountExVat != null) {
        amount = amountIncFromEx(amountExVat, vatRate);
      } else if (amountExVat == null && amount != null) {
        amountExVat = amountExFromInc(amount, vatRate);
      }
      if (amount == null || !dueDate) continue;
      const expense: ProjectExpenseItem = {
        id: cell(row, "id") || crypto.randomUUID(),
        amount,
        dueDate,
        createdAt: cell(row, "created_at") || new Date().toISOString(),
      };
      if (amountExVat != null && amountExVat > 0) {
        expense.amountExVat = amountExVat;
      }
      const percent = parseOptionalNumber(cell(row, "percent"));
      if (percent !== undefined) expense.percent = percent;
      const actual = cell(row, "actual_date");
      if (actual) expense.actualDate = actual;
      const label = cell(row, "label");
      if (label) expense.label = label;
      const mid = cell(row, "milestone_id");
      if (mid) expense.milestoneId = mid;
      const categoryRaw = cell(row, "category");
      const category =
        parseProjectExpenseCategory(categoryRaw) ??
        (isProjectExpenseCategory(categoryRaw)
          ? categoryRaw
          : inferExpenseCategory(label));
      expense.category = category;
      const subRaw = cell(row, "subcategory");
      if (category === "installation" || category === "maintenance") {
        const sub =
          parseInstallationSubcategory(subRaw) ??
          (isInstallationSubcategory(subRaw) ? subRaw : undefined) ??
          parseInstallationSubcategory(categoryRaw);
        if (sub) expense.subcategory = sub;
      }
      const lotId = cell(row, "warehouse_lot_id");
      if (lotId) expense.warehouseLotId = lotId;
      const budgetAmount = parseOptionalNumber(cell(row, "budget_amount"));
      if (budgetAmount != null && budgetAmount > 0) {
        expense.budgetAmount = budgetAmount;
      }
      f.expenseSchedule.push(expense);
      continue;
    }

    if (type === "warehouse_lot") {
      const lotId = cell(row, "id") || cell(row, "warehouse_lot_id");
      let unitInc = parseOptionalNumber(cell(row, "amount"));
      let unitEx = parseOptionalNumber(cell(row, "amount_ex_vat"));
      const vatRate =
        parseOptionalNumber(cell(row, "vat_rate")) ?? DEFAULT_VAT_RATE;
      if (unitInc == null && unitEx != null) {
        unitInc = amountIncFromEx(unitEx, vatRate);
      } else if (unitEx == null && unitInc != null) {
        unitEx = amountExFromInc(unitInc, vatRate);
      }
      if (!lotId || unitInc == null) continue;
      const snap: WarehouseLotCsvRow = {
        lotId,
        unitCostIncVat: unitInc,
        unitCostExVat: unitEx ?? amountExFromInc(unitInc, vatRate),
      };
      const itemId = cell(row, "warehouse_item_id");
      if (itemId) snap.itemId = itemId;
      const projectId = cell(row, "project_id");
      if (projectId) snap.projectId = projectId;
      const expenseId = cell(row, "entity_id");
      if (expenseId) snap.expenseId = expenseId;
      const qty = parseOptionalNumber(cell(row, "qty"));
      if (qty != null) snap.qtyReceived = qty;
      const receivedAt = cell(row, "due_date");
      if (receivedAt) snap.receivedAt = receivedAt;
      const cat = cell(row, "category");
      if (cat) snap.category = cat;
      const sub = cell(row, "subcategory");
      if (sub) snap.subcategory = sub;
      const label = cell(row, "label");
      if (label) snap.label = label;
      const createdAt = cell(row, "created_at");
      if (createdAt) snap.createdAt = createdAt;
      warehouseLots.push(snap);
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
    data: {
      byProjectId,
      byProjectName,
      financeSettings,
      history,
      warehouseLots,
    },
  };
}

/**
 * Apply type=warehouse_lot CSV rows onto in-memory warehouse lots (unit costs / meta).
 * Physical balances stay in Supabase; this only patches financial fields.
 */
export function applyWarehouseLotCsvRows(
  state: WarehouseState,
  rows: WarehouseLotCsvRow[],
): WarehouseState {
  if (!rows.length) return state;
  const byId = new Map(rows.map((r) => [r.lotId, r]));
  return {
    ...state,
    lots: state.lots.map((lot) => {
      const snap = byId.get(lot.id);
      if (!snap) return lot;
      const next: WarehouseLot = {
        ...lot,
        unitCostIncVat: snap.unitCostIncVat,
        unitCostExVat: snap.unitCostExVat,
      };
      if (snap.receivedAt) next.receivedAt = snap.receivedAt;
      if (snap.qtyReceived != null && snap.qtyReceived > 0) {
        next.qtyReceived = snap.qtyReceived;
      }
      if (snap.label !== undefined) {
        if (snap.label) next.label = snap.label;
      }
      if (snap.expenseId) next.expenseId = snap.expenseId;
      if (snap.category && isProjectExpenseCategory(snap.category)) {
        next.category = snap.category;
      }
      if (snap.subcategory) {
        const sub = parseProjectExpenseSubcategory(snap.subcategory);
        if (sub) next.subcategory = sub;
      }
      return next;
    }),
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
