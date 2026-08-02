import { createRequire } from "module";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const wb = XLSX.readFile("templates/projects/gantt.xlsx");
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Executive Gantt"], {
  header: 1,
  defval: "",
});

function excelDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const items = [];
for (const r of rows) {
  const wbs = String(r[0] || "").trim();
  const name = String(r[1] || "").trim();
  const owner = String(r[2] || "").trim();
  const start = r[3];
  const finish = r[4];
  const dur = r[5];
  const status = String(r[6] || "").trim() || "Planned";
  if (!wbs || !name || typeof start !== "number") continue;
  const isMilestone = Number(dur) === 1 && start === finish;
  const isPhase = /^\d+\.0$/.test(wbs);
  items.push({
    wbs,
    name,
    owner,
    start: excelDate(start),
    finish: excelDate(finish),
    dur: Number(dur) || 1,
    status,
    isMilestone,
    isPhase,
  });
}

const BAR = "#5B9BD5";
const REVIEW = "#70AD47";
const CLIENT = "#ED7D31";

const phases = items.filter((i) => i.isPhase);
const phaseIds = Object.fromEntries(phases.map((p) => [p.wbs, randomUUID()]));

function phaseKey(wbs) {
  return `${wbs.split(".")[0]}.0`;
}

function colorFor(item) {
  if (/FBK Design Review/i.test(item.name)) return REVIEW;
  if (/SITE PREPARATION/i.test(item.name)) return CLIENT;
  return BAR;
}

const sql = [];
sql.push(`-- ============================================================
-- Seed Gantt from templates/projects/gantt.xlsx
-- FBK 250 kW Electrolysis System → FBK project
--
-- Looks up project by name ILIKE '%FBK%'.
-- Edit the WHERE clause if your project name differs.
-- Re-runnable: deletes existing gantt rows for that project first.
-- Requires migrations 016–018 (gantt tables).
-- ============================================================

do $$
declare
  v_project_id uuid;
begin
  select id into v_project_id
  from public.projects
  where name ilike '%FBK%'
  order by created_at
  limit 1;

  if v_project_id is null then
    raise exception 'No project matching name ILIKE %%FBK%% found. Rename or edit this script.';
  end if;

  -- Cascade deletes activities + deadlines via phase_id FK
  delete from public.project_gantt_phases where project_id = v_project_id;
`);

phases.forEach((p, i) => {
  const id = phaseIds[p.wbs];
  sql.push(`  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '${id}'::uuid,
    v_project_id,
    '${esc(p.name)}',
    '${p.start}'::date,
    ${p.dur},
    '${colorFor(p)}',
    ${i},
    '${esc(p.wbs)}',
    '${esc(p.owner)}'
  );
`);
});

const actOrder = {};
let activityCount = 0;
let deadlineCount = 0;

for (const item of items) {
  if (item.isPhase) continue;
  const pk = phaseKey(item.wbs);
  const phaseId = phaseIds[pk];
  if (!phaseId) continue;

  if (item.isMilestone) {
    deadlineCount += 1;
    sql.push(`  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '${randomUUID()}'::uuid,
    v_project_id,
    '${phaseId}'::uuid,
    '${esc(item.name)}',
    '${item.start}'::date,
    '${esc(item.wbs)}',
    '${esc(item.owner)}'
  );
`);
  } else {
    actOrder[pk] = actOrder[pk] ?? 0;
    const sort = actOrder[pk]++;
    activityCount += 1;
    sql.push(`  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '${randomUUID()}'::uuid,
    v_project_id,
    '${phaseId}'::uuid,
    '${esc(item.name)}',
    '${item.start}'::date,
    ${item.dur},
    '${esc(item.wbs)}',
    '${esc(item.owner)}',
    '${colorFor(item)}',
    '${esc(item.status)}',
    ${sort}
  );
`);
  }
}

sql.push(`  raise notice 'Gantt seeded for FBK project %: ${phases.length} phases, ${activityCount} activities, ${deadlineCount} milestones', v_project_id;
end $$;
`);

writeFileSync("supabase/seed-fbk-gantt.sql", sql.join("\n"));
console.log(
  `Wrote supabase/seed-fbk-gantt.sql (${phases.length} phases, ${activityCount} activities, ${deadlineCount} milestones)`,
);
