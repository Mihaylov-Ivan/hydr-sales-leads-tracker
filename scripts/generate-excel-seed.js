const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");

const src = "templates/projects/projects-import-mapped-2.xlsx";
const out = "supabase/seed-projects-from-excel.sql";

const MARKETS = new Set([
  "Cement",
  "Power Plants",
  "Funding",
  "Clean H2",
  "Burner Optimisation",
  "Tenders",
]);
const SERIES = new Set(["Z Series", "E Series", "Custom"]);
const STAGES = new Set([
  "cold-lead",
  "hot-lead",
  "under-development",
  "commissioned",
  "cancelled",
]);

function sqlStr(v) {
  if (v == null) return "null";
  const s = String(v);
  if (!s.trim()) return "null";
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlText(v, fallback = "") {
  if (v == null || String(v).trim() === "") {
    return `'${String(fallback).replace(/'/g, "''")}'`;
  }
  return sqlStr(v);
}

function sqlBool(v, fallback = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "t" || s === "1" || s === "yes") return "true";
  if (s === "false" || s === "f" || s === "0" || s === "no") return "false";
  return fallback ? "true" : "false";
}

function sqlDate(v) {
  if (v == null || String(v).trim() === "") return "null";
  const d = String(v).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `'${d}'`;
  return "null";
}

function sqlTs(v) {
  if (v == null || String(v).trim() === "") return "null";
  return sqlStr(String(v).trim());
}

function uuidFromKey(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    "a" + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

function normalizeStage(v) {
  const s = String(v || "cold-lead").trim();
  if (s === "new-lead") return "cold-lead";
  return STAGES.has(s) ? s : "cold-lead";
}

function normalizeMarket(v) {
  const s = String(v || "Clean H2").trim();
  return MARKETS.has(s) ? s : "Clean H2";
}

function normalizeSeries(v) {
  const s = String(v || "Z Series").trim();
  return SERIES.has(s) ? s : "Z Series";
}

const wb = XLSX.readFile(src);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.projects_import, {
  defval: null,
  raw: false,
});

const lines = [];
lines.push("-- ============================================================");
lines.push("-- Seed projects (+ contacts) from Excel");
lines.push("-- Source: templates/projects/projects-import-mapped-2.xlsx");
lines.push(`-- Rows: ${rows.length}`);
lines.push("--");
lines.push("-- Prerequisites: base schema + migration-014 metrics columns");
lines.push("--   (or migration-014-to-018-consolidated + migration-019).");
lines.push("--");
lines.push("-- Safe to re-run: deterministic UUIDs + ON CONFLICT DO NOTHING.");
lines.push("-- Does NOT delete existing projects.");
lines.push("--");
lines.push("-- Run in: Supabase Dashboard → SQL Editor → New query → Run");
lines.push("-- ============================================================");
lines.push("");
lines.push("begin;");
lines.push("");

const projectValues = [];
const historyValues = [];
const contactValues = [];
let skipped = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const name = String(r.name || "").trim();
  const client = String(r.client || "").trim();
  if (!name || !client) {
    skipped++;
    continue;
  }

  const createdAtRaw = String(r.created_at || "").trim();
  const id = uuidFromKey(`excel-project:${name}|${createdAtRaw}|${i}`);
  const stage = normalizeStage(r.stage);
  const market = normalizeMarket(r.market);
  const series = normalizeSeries(r.series);
  let sizeKw = Number(r.size_kw);
  if (!Number.isFinite(sizeKw) || sizeKw <= 0) sizeKw = 10;

  const country = String(r.country || "Unknown").trim() || "Unknown";
  const city = String(r.city || "").trim();
  const createdAt = createdAtRaw || new Date().toISOString();
  const createdDate = createdAt.slice(0, 10);
  const lastContact =
    String(r.last_client_contact_at || "").trim().slice(0, 10) || createdDate;
  const reminderDays = Math.max(1, Number(r.email_reminder_days) || 7);
  const reminderEnabled = sqlBool(r.email_reminder_enabled, false);

  const cancelledAt =
    stage === "cancelled"
      ? sqlTs(r.cancelled_at) !== "null"
        ? sqlTs(r.cancelled_at)
        : sqlTs(createdAt)
      : sqlTs(r.cancelled_at);
  const cancellationReason =
    stage === "cancelled" || String(r.cancellation_reason || "").trim()
      ? sqlStr(r.cancellation_reason || "Imported cancelled deal")
      : "null";

  const coldAt = sqlTs(createdAt);
  let hotAt = "null";
  let udAt = "null";
  let comAt = "null";
  if (
    stage === "hot-lead" ||
    stage === "under-development" ||
    stage === "commissioned"
  ) {
    hotAt = sqlTs(createdAt);
  }
  if (stage === "under-development" || stage === "commissioned") {
    udAt = sqlTs(createdAt);
  }
  if (stage === "commissioned") {
    comAt = sqlTs(createdAt);
  }

  const leadUserId = String(r.lead_user_id || "").trim();
  const leadSql = leadUserId ? sqlStr(leadUserId) : "null";

  projectValues.push(`  (
    '${id}'::uuid,
    ${sqlText(name)},
    ${sqlText(client)},
    ${sqlText(country, "Unknown")},
    ${sqlText(city, "")},
    ${sqlText(series)},
    ${sqlText(market)},
    ${Math.round(sizeKw)},
    ${sqlText(stage)},
    ${sqlText(r.base_description, "")},
    ${leadSql},
    ${sqlDate(lastContact)},
    ${reminderDays},
    ${reminderEnabled},
    ${sqlTs(createdAt)},
    ${coldAt},
    ${hotAt},
    ${udAt},
    ${comAt},
    ${cancelledAt},
    ${sqlTs(lastContact + "T12:00:00.000Z")},
    ${cancellationReason}
  )`);

  historyValues.push(
    `  ('${id}'::uuid, ${sqlText(stage)}, ${sqlTs(createdAt)})`,
  );

  const cName = String(r.contact_name || "").trim();
  const cEmail = String(r.contact_email || "").trim();
  const cPhone = String(r.contact_phone || "").trim();
  const cPos = String(r.contact_position || "").trim();
  if (cName || cEmail || cPhone || cPos) {
    const cid = uuidFromKey(`excel-contact:${id}`);
    contactValues.push(`  (
    '${cid}'::uuid,
    '${id}'::uuid,
    ${cName ? sqlStr(cName) : "null"},
    ${cEmail ? sqlStr(cEmail) : "null"},
    ${cPhone ? sqlStr(cPhone) : "null"},
    ${cPos ? sqlStr(cPos) : "null"},
    ${sqlTs(createdAt)}
  )`);
  }
}

// Chunk inserts to keep SQL Editor happy (~100 rows per statement)
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const PROJECT_COLS = `insert into public.projects (
  id,
  name,
  client,
  country,
  city,
  series,
  market,
  size_kw,
  stage,
  base_description,
  lead_user_id,
  last_client_contact_at,
  email_reminder_days,
  email_reminder_enabled,
  created_at,
  cold_lead_entered_at,
  hot_lead_entered_at,
  under_development_at,
  commissioned_at,
  cancelled_at,
  last_meaningful_activity_at,
  cancellation_reason
) values`;

lines.push(
  `-- Insert ${projectValues.length} projects (skipped ${skipped} incomplete rows)`,
);
for (const part of chunk(projectValues, 80)) {
  lines.push(PROJECT_COLS);
  lines.push(part.join(",\n"));
  lines.push("on conflict (id) do nothing;");
  lines.push("");
}

lines.push("-- Seed one stage-history row per project (current stage at created_at)");
for (const part of chunk(historyValues, 120)) {
  lines.push(`insert into public.project_stage_history (project_id, stage, entered_at)
select v.project_id, v.stage, v.entered_at::timestamptz
from (values`);
  lines.push(part.join(",\n"));
  lines.push(`) as v(project_id, stage, entered_at)
where not exists (
  select 1 from public.project_stage_history h where h.project_id = v.project_id
);`);
  lines.push("");
}

if (contactValues.length) {
  lines.push(`-- Insert ${contactValues.length} contacts`);
  const CONTACT_COLS = `insert into public.project_contacts (
  id, project_id, name, email, phone, position, created_at
) values`;
  for (const part of chunk(contactValues, 100)) {
    lines.push(CONTACT_COLS);
    lines.push(part.join(",\n"));
    lines.push("on conflict (id) do nothing;");
    lines.push("");
  }
}

lines.push("commit;");
lines.push("");
lines.push(
  `-- Done. Expected ~${projectValues.length} projects, ~${contactValues.length} contacts.`,
);

fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Wrote ${out} (${fs.statSync(out).size} bytes)`);
console.log({
  projects: projectValues.length,
  contacts: contactValues.length,
  skipped,
});
