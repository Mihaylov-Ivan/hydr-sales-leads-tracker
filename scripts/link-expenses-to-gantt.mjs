/**
 * Update finance CSV:
 * 1. Insert amount_ex_vat + vat_rate columns (20% VAT) after amount
 * 2. Copy milestone_id from matching payments onto expense rows
 *
 * Matching: same project_id; expense label with "Costs · " stripped ≈ payment label
 * (case-insensitive). Falls back to classifyLabel kind match.
 *
 * Usage: node scripts/link-expenses-to-gantt.mjs
 */
import fs from "fs";

const CSV_PATH =
  "templates/finance-import/financial-data-2026-08-05 (6).csv";
const VAT_RATE = 0.2;

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function esc(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function joinCsvLine(cols) {
  return cols.map(esc).join(",");
}

function normalizeLabel(label) {
  return (label || "")
    .trim()
    .toLowerCase()
    .replace(/^costs\s*[·•\-–—:]\s*/i, "")
    .replace(/\s+/g, " ");
}

function classifyLabel(label) {
  const l = normalizeLabel(label);
  if (!l) return null;
  if (/prepayment|pre.?pay|down.?pay|contract/.test(l)) return "prepayment";
  if (/engineering\s*approval/.test(l)) return "design";
  if (/design/.test(l)) return "design";
  if (/engineering/.test(l)) return "engineering";
  if (/\bfat\b|factory acceptance/.test(l)) return "fat";
  if (/\bsat\b|site acceptance/.test(l)) return "sat";
  if (/\bfac\b|final acceptance|handover/.test(l)) return "fac";
  return null;
}

function amountExFromInc(inc) {
  const n = Number(inc);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round((n / (1 + VAT_RATE)) * 100) / 100);
}

const text = fs.readFileSync(CSV_PATH, "utf8");
const lines = text.split(/\r?\n/);
const oldHeader = parseCsvLine(lines[0]);
const oldIdx = Object.fromEntries(oldHeader.map((h, i) => [h.trim(), i]));

const NEW_HEADERS = [
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
];

function get(cols, name) {
  const i = oldIdx[name];
  return i == null ? "" : (cols[i] ?? "");
}

// Build payment lookup: projectId → [{ labelNorm, kind, milestoneId }]
const paymentsByProject = new Map();
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]?.trim()) continue;
  const cols = parseCsvLine(lines[i]);
  if (get(cols, "type") !== "payment") continue;
  const pid = get(cols, "project_id");
  const mid = get(cols, "milestone_id").trim();
  if (!mid) continue;
  if (!paymentsByProject.has(pid)) paymentsByProject.set(pid, []);
  paymentsByProject.get(pid).push({
    labelNorm: normalizeLabel(get(cols, "label")),
    kind: classifyLabel(get(cols, "label")),
    milestoneId: mid,
  });
}

function matchExpenseMilestone(projectId, expenseLabel) {
  const pays = paymentsByProject.get(projectId) ?? [];
  if (!pays.length) return "";
  const norm = normalizeLabel(expenseLabel);
  const exact = pays.find((p) => p.labelNorm && p.labelNorm === norm);
  if (exact) return exact.milestoneId;
  // Partial: payment label contained in expense or vice versa
  const partial = pays.find(
    (p) =>
      p.labelNorm &&
      norm &&
      (norm.includes(p.labelNorm) || p.labelNorm.includes(norm)),
  );
  if (partial) return partial.milestoneId;
  const kind = classifyLabel(expenseLabel);
  if (!kind) return "";
  const byKind = pays.filter((p) => p.kind === kind);
  if (byKind.length === 1) return byKind[0].milestoneId;
  // Prefer ordinal match for FAT/SAT 1/2, 2/2
  if (byKind.length > 1) {
    const ord = /\b(1\/2|2\/2|first|second)\b/i.exec(expenseLabel);
    if (ord) {
      const needle = ord[1].toLowerCase();
      const hit = byKind.find((p) =>
        (p.labelNorm || "").includes(needle.replace("first", "1/2").replace("second", "2/2")) ||
        (needle.includes("1") && /1\/2|first/.test(p.labelNorm)) ||
        (needle.includes("2") && /2\/2|second/.test(p.labelNorm)),
      );
      if (hit) return hit.milestoneId;
    }
  }
  return byKind[0]?.milestoneId ?? "";
}

const out = [joinCsvLine(NEW_HEADERS)];
let linked = 0;
let expenses = 0;

for (let i = 1; i < lines.length; i++) {
  if (!lines[i]?.trim()) continue;
  const cols = parseCsvLine(lines[i]);
  const type = get(cols, "type");
  const amount = get(cols, "amount");
  let milestoneId = get(cols, "milestone_id");
  let amountExVat = get(cols, "amount_ex_vat");
  let vatRate = get(cols, "vat_rate");

  if (type === "expense") {
    expenses++;
    if (!milestoneId.trim()) {
      const mid = matchExpenseMilestone(
        get(cols, "project_id"),
        get(cols, "label"),
      );
      if (mid) {
        milestoneId = mid;
        linked++;
      }
    }
    if (!amountExVat && amount) {
      amountExVat = amountExFromInc(amount);
      vatRate = String(VAT_RATE);
    }
  } else if (
    (type === "payment" || type === "expense") &&
    amount &&
    !amountExVat &&
    type === "expense"
  ) {
    // already handled
  }

  if (type === "expense" && amount && !vatRate) {
    vatRate = String(VAT_RATE);
  }

  const row = NEW_HEADERS.map((h) => {
    if (h === "amount_ex_vat") return amountExVat;
    if (h === "vat_rate") return type === "expense" ? vatRate || String(VAT_RATE) : "";
    if (h === "milestone_id") return milestoneId;
    return get(cols, h);
  });
  out.push(joinCsvLine(row));
}

fs.writeFileSync(CSV_PATH, out.join("\r\n") + "\r\n", "utf8");
console.log(
  `Updated ${CSV_PATH}: ${linked}/${expenses} expenses linked to payment milestones; added amount_ex_vat + vat_rate.`,
);
