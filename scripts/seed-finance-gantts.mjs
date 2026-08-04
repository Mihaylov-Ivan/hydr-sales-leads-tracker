import fs from "fs";
import crypto from "crypto";

const uuid = () => crypto.randomUUID();

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)[1].trim();
const headers = {
  apikey: anon,
  Authorization: "Bearer " + anon,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const BAR = "#5B9BD5";

function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function daysBetween(a, b) {
  const x = new Date(a + "T12:00:00");
  const y = new Date(b + "T12:00:00");
  return Math.round((y - x) / 86400000);
}

function addDays(a, n) {
  const d = new Date(a + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function durationDays(start, end) {
  return Math.max(1, daysBetween(start, end) + 1);
}

function lerpDate(a, b, t) {
  return addDays(a, Math.round(daysBetween(a, b) * t));
}

function classifyLabel(label) {
  const l = (label || "").toLowerCase().trim();
  if (!l) return null;
  if (/prepayment|pre.?pay|down.?pay|contract/.test(l)) return "prepayment";
  if (/design/.test(l)) return "design";
  if (/engineering/.test(l)) return "engineering";
  if (/\bfat\b|factory acceptance/.test(l)) return "fat";
  if (/\bsat\b|site acceptance/.test(l)) return "sat";
  if (/\bfac\b|final acceptance|handover/.test(l)) return "fac";
  if (/^done$/.test(l)) return "fac";
  return null;
}

/** Known CSV date typos that break chronology */
const DATE_FIXES = {
  "6371ba92-ec34-41d1-94ac-e3e9dd0cde4f:FAC": "2027-12-01",
  "e021f65c-b418-4103-abe0-e6e0b3b31424:SAT": "2027-08-20",
  "bfb5de33-420b-4811-81e5-fab089735bd0:FAC": "2028-02-01",
};

function buildFromMilestones(projectId, projectName, milestones) {
  let { prepayment, design, engineering, fat, sat, fac } = milestones;

  if (!prepayment && design) prepayment = design;
  if (!prepayment && engineering) prepayment = engineering;
  if (!design && engineering) design = engineering;
  if (!design && prepayment)
    design = lerpDate(prepayment, engineering || fat || fac, 0.25);
  if (!engineering && design) engineering = design;
  if (!engineering && fat) engineering = lerpDate(prepayment, fat, 0.3);
  if (!sat && fat && fac) sat = lerpDate(fat, fac, 0.5);
  if (!sat && fac) sat = fac;
  if (!fat && engineering && sat) fat = lerpDate(engineering, sat, 0.7);
  if (!fac && sat) fac = addDays(sat, 30);

  if (!prepayment || !fac) return null;

  const vals = { prepayment, design, engineering, fat, sat, fac };
  const chain = ["prepayment", "design", "engineering", "fat", "sat", "fac"];
  for (let i = 1; i < chain.length; i++) {
    const prev = vals[chain[i - 1]];
    const cur = vals[chain[i]];
    if (cur && prev && daysBetween(prev, cur) < 0) {
      vals[chain[i]] = addDays(
        prev,
        Math.max(7, Math.round(daysBetween(prepayment, fac) * 0.05)),
      );
    }
  }
  ({ prepayment, design, engineering, fat, sat, fac } = vals);

  const shortName = projectName.replace(/\s+/g, " ").trim();
  const ownerBoth = `Hydrogenera / ${shortName}`;

  const p1 = uuid();
  const p2 = uuid();
  const p3 = uuid();
  const p4 = uuid();

  const phases = [
    {
      id: p1,
      project_id: projectId,
      name: "PROJECT INITIATION",
      start_date: prepayment,
      duration_days: 1,
      color: BAR,
      sort_order: 0,
      wbs: "1.0",
      owner: ownerBoth,
    },
    {
      id: p2,
      project_id: projectId,
      name: "ENGINEERING AND DESIGN",
      start_date: prepayment,
      duration_days: durationDays(prepayment, engineering),
      color: BAR,
      sort_order: 1,
      wbs: "2.0",
      owner: "Hydrogenera",
    },
    {
      id: p3,
      project_id: projectId,
      name: "PROCUREMENT, MANUFACTURING AND FAT",
      start_date: engineering,
      duration_days: durationDays(engineering, fat),
      color: BAR,
      sort_order: 2,
      wbs: "3.0",
      owner: "Hydrogenera",
    },
    {
      id: p4,
      project_id: projectId,
      name: "INSTALLATION, SAT AND HANDOVER",
      start_date: fat,
      duration_days: durationDays(fat, fac),
      color: BAR,
      sort_order: 3,
      wbs: "4.0",
      owner: ownerBoth,
    },
  ];

  const designStart = prepayment;
  const designEnd = design;
  const engStart = lerpDate(prepayment, design, 0.45);
  const engEnd = engineering;

  const procStart = engineering;
  const procEnd = lerpDate(engineering, fat, 0.55);
  const mfgStart = lerpDate(engineering, fat, 0.18);
  const mfgEnd = lerpDate(engineering, fat, 0.88);
  const fatActStart = lerpDate(engineering, fat, 0.88);
  const fatActEnd = fat;

  const shipStart = fat;
  const shipEnd = lerpDate(fat, sat, 0.55);
  const instStart = lerpDate(fat, sat, 0.35);
  const instEnd = lerpDate(fat, sat, 0.85);
  const satActStart = lerpDate(fat, sat, 0.7);
  const satActEnd = sat;
  const handStart = sat;
  const handEnd = fac;

  const activities = [
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p2,
      name: "Detailed Design",
      start_date: designStart,
      duration_days: durationDays(designStart, designEnd),
      wbs: "2.1",
      owner: "Hydrogenera",
      color: BAR,
      status: "Planned",
      sort_order: 0,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p2,
      name: "Detailed Engineering",
      start_date: engStart,
      duration_days: durationDays(engStart, engEnd),
      wbs: "2.2",
      owner: "Hydrogenera",
      color: BAR,
      status: "Planned",
      sort_order: 1,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p3,
      name: "Procurement",
      start_date: procStart,
      duration_days: durationDays(procStart, procEnd),
      wbs: "3.1",
      owner: "Hydrogenera",
      color: BAR,
      status: "Planned",
      sort_order: 0,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p3,
      name: "Manufacturing",
      start_date: mfgStart,
      duration_days: durationDays(mfgStart, mfgEnd),
      wbs: "3.2",
      owner: "Hydrogenera",
      color: BAR,
      status: "Planned",
      sort_order: 1,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p3,
      name: "Factory Acceptance Test (FAT)",
      start_date: fatActStart,
      duration_days: durationDays(fatActStart, fatActEnd),
      wbs: "3.3",
      owner: ownerBoth,
      color: BAR,
      status: "Planned",
      sort_order: 2,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "Packing, Shipping and Site Preparation",
      start_date: shipStart,
      duration_days: durationDays(shipStart, shipEnd),
      wbs: "4.1",
      owner: "Hydrogenera",
      color: BAR,
      status: "Planned",
      sort_order: 0,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "Installation",
      start_date: instStart,
      duration_days: durationDays(instStart, instEnd),
      wbs: "4.2",
      owner: ownerBoth,
      color: BAR,
      status: "Planned",
      sort_order: 1,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "Commissioning and Site Acceptance Test (SAT)",
      start_date: satActStart,
      duration_days: durationDays(satActStart, satActEnd),
      wbs: "4.3",
      owner: ownerBoth,
      color: BAR,
      status: "Planned",
      sort_order: 2,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "Handover and Punch-list Close-out",
      start_date: handStart,
      duration_days: durationDays(handStart, handEnd),
      wbs: "4.4",
      owner: ownerBoth,
      color: BAR,
      status: "Planned",
      sort_order: 3,
    },
  ];

  const deadlines = [
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p1,
      name: "Contract Signed / Prepayment",
      date: prepayment,
      wbs: "1.1",
      owner: shortName,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p2,
      name: "Design Approval",
      date: design,
      wbs: "2.3",
      owner: ownerBoth,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p2,
      name: "Engineering Complete",
      date: engineering,
      wbs: "2.4",
      owner: "Hydrogenera",
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p3,
      name: "FAT Complete",
      date: fat,
      wbs: "3.4",
      owner: ownerBoth,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "SAT Complete",
      date: sat,
      wbs: "4.5",
      owner: ownerBoth,
    },
    {
      id: uuid(),
      project_id: projectId,
      phase_id: p4,
      name: "FAC / Contract Complete",
      date: fac,
      wbs: "4.6",
      owner: ownerBoth,
    },
  ];

  return {
    phases,
    activities,
    deadlines,
    milestones: { prepayment, design, engineering, fat, sat, fac },
  };
}

function buildFromPaymentSequence(projectId, projectName, payments) {
  const dates = payments
    .map((p) => parseDate(p.due_date))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;

  if (dates.length === 1) {
    const fac = dates[0];
    const prepayment = addDays(fac, -60);
    return buildFromMilestones(projectId, projectName, {
      prepayment,
      design: addDays(prepayment, 20),
      engineering: addDays(prepayment, 35),
      fat: addDays(fac, -20),
      sat: addDays(fac, -5),
      fac,
    });
  }

  if (dates.length === 2) {
    return buildFromMilestones(projectId, projectName, {
      prepayment: dates[0],
      design: lerpDate(dates[0], dates[1], 0.2),
      engineering: lerpDate(dates[0], dates[1], 0.3),
      fat: lerpDate(dates[0], dates[1], 0.7),
      sat: lerpDate(dates[0], dates[1], 0.85),
      fac: dates[1],
    });
  }

  if (dates.length === 3) {
    return buildFromMilestones(projectId, projectName, {
      prepayment: dates[0],
      design: lerpDate(dates[0], dates[1], 0.35),
      engineering: lerpDate(dates[0], dates[1], 0.55),
      fat: dates[1],
      sat: lerpDate(dates[1], dates[2], 0.55),
      fac: dates[2],
    });
  }

  // N1-style: first, intermediate, FAT-ish, done
  return buildFromMilestones(projectId, projectName, {
    prepayment: dates[0],
    design: dates[1],
    engineering: dates[Math.min(2, dates.length - 3)] || dates[1],
    fat: dates[dates.length - 2],
    sat: lerpDate(dates[dates.length - 2], dates[dates.length - 1], 0.5),
    fac: dates[dates.length - 1],
  });
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function toSql(projectId, projectName, schedule) {
  const lines = [];
  lines.push(`-- ${projectName} (${projectId})`);
  lines.push(
    `delete from public.project_gantt_phases where project_id = '${projectId}'::uuid;`,
  );
  for (const p of schedule.phases) {
    lines.push(
      `insert into public.project_gantt_phases (id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner) values ('${p.id}'::uuid, '${projectId}'::uuid, '${sqlEscape(p.name)}', '${p.start_date}'::date, ${p.duration_days}, '${p.color}', ${p.sort_order}, '${p.wbs}', '${sqlEscape(p.owner)}');`,
    );
  }
  for (const a of schedule.activities) {
    lines.push(
      `insert into public.project_gantt_activities (id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order) values ('${a.id}'::uuid, '${projectId}'::uuid, '${a.phase_id}'::uuid, '${sqlEscape(a.name)}', '${a.start_date}'::date, ${a.duration_days}, '${a.wbs}', '${sqlEscape(a.owner)}', '${a.color}', '${a.status}', ${a.sort_order});`,
    );
  }
  for (const d of schedule.deadlines) {
    lines.push(
      `insert into public.project_gantt_deadlines (id, project_id, phase_id, name, date, wbs, owner) values ('${d.id}'::uuid, '${projectId}'::uuid, '${d.phase_id}'::uuid, '${sqlEscape(d.name)}', '${d.date}'::date, '${d.wbs}', '${sqlEscape(d.owner)}');`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function delPhases(projectId) {
  const r = await fetch(
    `${url}/rest/v1/project_gantt_phases?project_id=eq.${projectId}`,
    { method: "DELETE", headers },
  );
  if (!r.ok)
    throw new Error(`delete ${projectId}: ${r.status} ${await r.text()}`);
}

async function post(table, rows) {
  if (!rows.length) return [];
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!r.ok)
    throw new Error(`post ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

const csvPath = "templates/finance-import/financial-data-2026-08-04 (45).csv";
const csvLines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const header = csvLines[0].split(",");
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const projects = new Map();
for (let i = 1; i < csvLines.length; i++) {
  const cols = csvLines[i].split(",");
  const type = cols[idx.type];
  const id = cols[idx.project_id];
  const name = cols[idx.project_name];
  if (type === "project") {
    if (!projects.has(id)) projects.set(id, { name, payments: [] });
  } else if (type === "payment") {
    if (!projects.has(id)) projects.set(id, { name, payments: [] });
    projects.get(id).payments.push({
      label: cols[idx.label],
      due_date: cols[idx.due_date],
      percent: cols[idx.percent],
    });
  }
}

const SKIP = new Set([
  "b2fd32ac-9d24-4ac4-8092-a5a106618c96", // Ceramika
  "ee994a13-e24f-453e-bf8f-8c43f0c1b6db", // FBK
  "140dfb68-fb1b-482c-8ba4-34d6c389028a", // Metlen
]);

const existing = await fetch(
  `${url}/rest/v1/project_gantt_phases?select=project_id`,
  { headers },
).then((r) => r.json());
const hasGantt = new Set(existing.map((r) => r.project_id));

const sqlParts = [
  "-- ============================================================",
  "-- Seed simple Gantt schedules from finance payment milestones",
  "-- Source: templates/finance-import/financial-data-2026-08-04 (45).csv",
  "-- Skips Ceramika, FBK, Metlen (already have detailed charts).",
  "-- Date typo fixes: UBE FAC→2027-12-01, Interbudkomplex SAT→2027-08-20,",
  "--                  ZF FAC→2028-02-01",
  "-- Re-runnable.",
  "-- ============================================================",
  "",
  "begin;",
  "",
];

const results = [];

for (const [projectId, { name, payments }] of projects) {
  if (SKIP.has(projectId) || hasGantt.has(projectId)) {
    results.push({ name, status: "skipped-existing" });
    continue;
  }
  if (payments.length === 0) {
    results.push({ name, status: "skipped-no-payments" });
    continue;
  }

  const ms = {};
  for (const p of payments) {
    const kind = classifyLabel(p.label);
    let date = parseDate(p.due_date);
    if (!kind || !date) continue;
    if (kind === "fac" && DATE_FIXES[`${projectId}:FAC`]) {
      date = DATE_FIXES[`${projectId}:FAC`];
    }
    if (kind === "sat" && DATE_FIXES[`${projectId}:SAT`]) {
      date = DATE_FIXES[`${projectId}:SAT`];
    }
    if (!ms[kind]) ms[kind] = date;
  }

  const classifiedCount = Object.keys(ms).length;
  let schedule;
  if (classifiedCount >= 3 && (ms.prepayment || ms.fat || ms.fac)) {
    if (!ms.prepayment) {
      const dates = payments
        .map((p) => parseDate(p.due_date))
        .filter(Boolean)
        .sort();
      ms.prepayment = dates[0];
    }
    if (!ms.fac) {
      const dates = payments
        .map((p) => parseDate(p.due_date))
        .filter(Boolean)
        .sort();
      ms.fac = dates[dates.length - 1];
    }
    schedule = buildFromMilestones(projectId, name, ms);
  } else {
    schedule = buildFromPaymentSequence(projectId, name, payments);
  }

  if (!schedule) {
    results.push({ name, status: "skipped-could-not-build", ms });
    continue;
  }

  await delPhases(projectId);
  await post("project_gantt_phases", schedule.phases);
  await post("project_gantt_activities", schedule.activities);
  await post("project_gantt_deadlines", schedule.deadlines);
  sqlParts.push(toSql(projectId, name, schedule));
  results.push({
    name,
    status: "seeded",
    milestones: schedule.milestones,
    phases: schedule.phases.length,
    activities: schedule.activities.length,
    deadlines: schedule.deadlines.length,
  });
}

sqlParts.push("commit;");
fs.writeFileSync(
  "supabase/seed-finance-milestone-gantts.sql",
  sqlParts.join("\n"),
  "utf8",
);

console.log(JSON.stringify(results, null, 2));
