/**
 * One-off: upgrade a financial CSV to include history columns.
 * Usage: node scripts/upgrade-financial-csv-headers.mjs <input> <output>
 */
import fs from "fs";

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
  "subcategory",
  "is_maintenance",
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
];

function parseCsv(text) {
  const rows = [];
  let row = [];
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
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function esc(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("Usage: node scripts/upgrade-financial-csv-headers.mjs <in> <out>");
  process.exit(1);
}

const text = fs.readFileSync(input, "utf8");
const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim().toLowerCase());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const out = [NEW_HEADERS.join(",")];
for (const row of rows.slice(1)) {
  out.push(
    NEW_HEADERS.map((h) => {
      const i = idx[h];
      return esc(i == null ? "" : (row[i] ?? ""));
    }).join(","),
  );
}
fs.writeFileSync(output, out.join("\r\n") + "\r\n");
const added = NEW_HEADERS.filter((h) => !(h in idx));
console.log(`Wrote ${output}`);
console.log(`Data rows: ${out.length - 1}; cols: ${NEW_HEADERS.length}`);
console.log(`Added columns: ${added.join(", ") || "(none)"}`);
