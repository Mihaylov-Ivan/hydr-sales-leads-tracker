/**
 * Add proportional expenses (+1 month after each payment) for given projects.
 * Usage: node scripts/add-proportional-expenses.mjs
 */
import fs from "fs";
import crypto from "crypto";

const CSV = "templates/finance-import/financial-data-2026-08-04 (51).csv";
const TODAY = "2026-08-04";

const TARGETS = {
  "5b8c0672-de99-4b4d-a05f-043e2643a5c4": 520000, // Burkhard
  "bfb5de33-420b-4811-81e5-fab089735bd0": 2280000, // ZF
  "e021f65c-b418-4103-abe0-e6e0b3b31424": 200000, // Interbudkomplex
};

function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d, last);
  const out = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), day));
  return out.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const text = fs.readFileSync(CSV, "utf8");
const lines = text.split(/\r?\n/);
const header = lines[0].split(",");
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const payments = new Map();
const contractValue = new Map();

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = lines[i].split(",");
  const pid = cols[idx.project_id];
  if (!TARGETS[pid]) continue;
  if (cols[idx.type] === "project") {
    contractValue.set(pid, Number(cols[idx.contract_value] || 0));
  }
  if (cols[idx.type] === "payment") {
    if (!payments.has(pid)) payments.set(pid, []);
    payments.get(pid).push({
      label: cols[idx.label] || "",
      amount: Number(cols[idx.amount]),
      percent: cols[idx.percent] ? Number(cols[idx.percent]) : null,
      due: cols[idx.due_date],
      lineIndex: i,
    });
  }
  // Drop prior "Costs ·" expenses for these projects so re-runs are safe
  if (
    cols[idx.type] === "expense" &&
    String(cols[idx.label] || "").startsWith("Costs ·")
  ) {
    lines[i] = null;
  }
}

const cleaned = lines.filter((l) => l != null);

// Re-index payments against cleaned lines
const payments2 = new Map();
for (let i = 1; i < cleaned.length; i++) {
  if (!cleaned[i].trim()) continue;
  const cols = cleaned[i].split(",");
  const pid = cols[idx.project_id];
  if (!TARGETS[pid] || cols[idx.type] !== "payment") continue;
  if (!payments2.has(pid)) payments2.set(pid, []);
  payments2.get(pid).push({
    label: cols[idx.label] || "",
    amount: Number(cols[idx.amount]),
    percent: cols[idx.percent] ? Number(cols[idx.percent]) : null,
    due: cols[idx.due_date],
    lineIndex: i,
    name: cols[idx.project_name],
  });
}

const inserts = [];
const summary = [];

for (const [pid, totalExp] of Object.entries(TARGETS)) {
  const pays = payments2.get(pid) || [];
  const cv = contractValue.get(pid) || 0;
  const name = pays[0]?.name || pid;

  let percents = pays.map((p) => {
    if (p.percent != null && Number.isFinite(p.percent) && p.percent > 0)
      return p.percent;
    if (cv > 0 && p.amount > 0) return (p.amount / cv) * 100;
    if (/\bsat\b/i.test(p.label)) return 5;
    return 0;
  });
  // Normalize if percents don't sum to ~100 (e.g. Burkhard 70+10+10+10+5+5=110)
  const pctSum = percents.reduce((a, b) => a + b, 0);
  if (pctSum > 0 && Math.abs(pctSum - 100) > 0.05) {
    percents = percents.map((p) => (p / pctSum) * 100);
  }

  const amounts = percents.map((p) => Math.round((totalExp * p) / 100));
  const diff = totalExp - amounts.reduce((a, b) => a + b, 0);
  if (amounts.length) amounts[amounts.length - 1] += diff;

  const expenseLines = [];
  for (let i = 0; i < pays.length; i++) {
    const due = addMonths(pays[i].due, 1);
    const actual = due <= TODAY ? due : "";
    const cols = new Array(header.length).fill("");
    cols[idx.type] = "expense";
    cols[idx.project_id] = pid;
    cols[idx.project_name] = name;
    cols[idx.id] = crypto.randomUUID();
    cols[idx.label] = pays[i].label
      ? `Costs · ${pays[i].label}`
      : "Costs";
    cols[idx.amount] = String(amounts[i]);
    cols[idx.percent] = String(round2(percents[i]));
    cols[idx.due_date] = due;
    cols[idx.actual_date] = actual;
    cols[idx.created_at] = "2026-08-04T21:14:00.000Z";
    expenseLines.push(cols.join(","));
  }

  for (let i = 1; i < cleaned.length; i++) {
    const cols = cleaned[i].split(",");
    if (cols[idx.type] === "project" && cols[idx.project_id] === pid) {
      cols[idx.expenses] = String(totalExp);
      if (cv) cols[idx.expected_profit] = String(cv - totalExp);
      cleaned[i] = cols.join(",");
      break;
    }
  }

  const lastPayLine = Math.max(...pays.map((p) => p.lineIndex));
  inserts.push({ afterLine: lastPayLine, rows: expenseLines });
  summary.push({
    name,
    totalExp,
    chunks: pays.map((p, i) => ({
      label: p.label,
      pct: percents[i],
      amount: amounts[i],
      pay: p.due,
      exp: addMonths(p.due, 1),
    })),
  });
}

inserts.sort((a, b) => b.afterLine - a.afterLine);
for (const ins of inserts) {
  cleaned.splice(ins.afterLine + 1, 0, ...ins.rows);
}

fs.writeFileSync(CSV, cleaned.join("\n"), "utf8");
console.log(JSON.stringify(summary, null, 2));
