/**
 * Link finance CSV payment incomes to Gantt deadlines/milestones.
 * Skips Titan Zlatna Panega. Leaves FBK links that already exist.
 *
 * Usage: node scripts/link-payments-to-gantt.mjs
 */
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)[1].trim();
const headers = { apikey: anon, Authorization: "Bearer " + anon };

const CSV_PATH =
  "templates/finance-import/financial-data-2026-08-04 (45).csv";
const SKIP_PROJECTS = new Set([
  "ffa5c116-6ce2-4653-9508-1da0bb910a53", // Titan Zlatna Panega
]);

function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function formatCsvDate(iso) {
  // Keep m/d/yyyy style used in this file
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function classifyLabel(label) {
  const l = (label || "").toLowerCase().trim();
  if (!l) return null;
  if (/prepayment|pre.?pay|down.?pay|contract/.test(l)) return "prepayment";
  if (/engineering\s*approval/.test(l)) return "design"; // Metlen wording
  if (/design/.test(l)) return "design";
  if (/engineering/.test(l)) return "engineering";
  if (/\bfat\b|factory acceptance/.test(l)) return "fat";
  if (/\bsat\b|site acceptance/.test(l)) return "sat";
  if (/\bfac\b|final acceptance|handover/.test(l)) return "fac";
  if (/^done$/.test(l)) return "fac";
  return null;
}

function scoreDeadline(kind, name, label) {
  const n = name.toLowerCase();
  const lab = (label || "").toLowerCase();
  if (kind === "prepayment") {
    if (/order received|contract signed|prepayment|down payment|contract award/.test(n))
      return 10;
    return 0;
  }
  if (kind === "design") {
    if (/design approval|design complete|design done|design freeze|design documentation/.test(n))
      return 10;
    return 0;
  }
  if (kind === "engineering") {
    if (/engineering complete|engineering done/.test(n)) return 10;
    if (/design complete/.test(n)) return 5; // Metlen fallback
    return 0;
  }
  if (kind === "fat") {
    if (!/\bfat\b|factory acceptance/.test(n)) return 0;
    // Metlen dual trains
    if (/1\/2|first/.test(lab) && /first|1\/2|1st/.test(n)) return 12;
    if (/2\/2|second/.test(lab) && /second|2\/2|2nd/.test(n)) return 12;
    if (/1\/2|first/.test(lab) && /second|2/.test(n)) return 1;
    if (/2\/2|second/.test(lab) && /first|1/.test(n)) return 1;
    return 8;
  }
  if (kind === "sat") {
    if (/\bsat\b|site acceptance/.test(n)) return 10;
    // Metlen: no SAT milestone — use handover for the matching train
    if (/1\/2|first/.test(lab) && /first.*handover|handover.*first/.test(n))
      return 7;
    if (/2\/2|second/.test(lab) && /second.*handover|handover.*second|project complete/.test(n))
      return 7;
    if (/handover/.test(n)) return 3;
    return 0;
  }
  if (kind === "fac") {
    if (/\bfac\b|contract complete|project complete|contractual completion|final handover/.test(n))
      return 10;
    if (/handover/.test(n) && /second|project/.test(n)) return 6;
    return 0;
  }
  return 0;
}

function pickDeadline(kind, label, deadlines) {
  let best = null;
  let bestScore = 0;
  for (const d of deadlines) {
    const s = scoreDeadline(kind, d.name, label);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Unlabeled payments: map by chronological order onto standard milestones. */
function sequenceKinds(count) {
  if (count <= 1) return ["fac"];
  if (count === 2) return ["prepayment", "fac"];
  if (count === 3) return ["prepayment", "fat", "fac"];
  if (count === 4) return ["prepayment", "design", "fat", "fac"];
  return ["prepayment", "design", "engineering", "fat", "sat", "fac"].slice(
    0,
    count,
  );
}

function parseCsvLine(line) {
  // Simple CSV: no quoted commas in this file's payment rows
  return line.split(",");
}

function joinCsvLine(cols) {
  return cols.join(",");
}

const [deadlines, activities, projects] = await Promise.all([
  fetch(
    `${url}/rest/v1/project_gantt_deadlines?select=id,project_id,name,date,wbs&order=date`,
    { headers },
  ).then((r) => r.json()),
  fetch(
    `${url}/rest/v1/project_gantt_activities?select=id,project_id,name,start_date,duration_days,wbs`,
    { headers },
  ).then((r) => r.json()),
  fetch(`${url}/rest/v1/projects?select=id,name`, { headers }).then((r) =>
    r.json(),
  ),
]);

const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
const deadlinesByProject = new Map();
for (const d of deadlines) {
  if (!deadlinesByProject.has(d.project_id))
    deadlinesByProject.set(d.project_id, []);
  deadlinesByProject.get(d.project_id).push(d);
}

// For Metlen SAT, also allow linking to SAT activities if no SAT deadline
const activitiesByProject = new Map();
for (const a of activities) {
  if (!activitiesByProject.has(a.project_id))
    activitiesByProject.set(a.project_id, []);
  activitiesByProject.get(a.project_id).push(a);
}

function activityEnd(a) {
  const start = new Date(a.start_date + "T12:00:00");
  start.setDate(start.getDate() + Math.max(1, a.duration_days) - 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pickSatFallback(label, projectId) {
  const acts = activitiesByProject.get(projectId) ?? [];
  const sats = acts.filter((a) => /\bsat\b|site acceptance/i.test(a.name));
  if (!sats.length) return null;
  const lab = (label || "").toLowerCase();
  if (/2\/2|second/.test(lab) && sats.length >= 2) {
    return { id: sats[1].id, date: activityEnd(sats[1]), name: sats[1].name };
  }
  if (/1\/2|first/.test(lab) || sats.length === 1) {
    return { id: sats[0].id, date: activityEnd(sats[0]), name: sats[0].name };
  }
  // second of two if unlabeled ordinal but two exist — handled by caller
  return { id: sats[0].id, date: activityEnd(sats[0]), name: sats[0].name };
}

const text = fs.readFileSync(CSV_PATH, "utf8");
const lines = text.split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

// Collect payment rows per project for sequence mapping
const paymentsByProject = new Map();
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = parseCsvLine(lines[i]);
  if (cols[idx.type] !== "payment") continue;
  const pid = cols[idx.project_id];
  if (!paymentsByProject.has(pid)) paymentsByProject.set(pid, []);
  paymentsByProject.get(pid).push({ lineIndex: i, cols });
}

const report = [];
const usedDeadlineIds = new Set();

for (const [projectId, pays] of paymentsByProject) {
  if (SKIP_PROJECTS.has(projectId)) {
    report.push({
      project: projectNames[projectId] || projectId,
      status: "skipped",
    });
    continue;
  }

  const dls = deadlinesByProject.get(projectId) ?? [];
  if (!dls.length) {
    report.push({
      project: projectNames[projectId] || projectId,
      status: "no-gantt",
    });
    continue;
  }

  // Sort payments by due date for sequence fallback
  const ordered = [...pays].sort((a, b) => {
    const da = parseDate(a.cols[idx.due_date]) || "";
    const db = parseDate(b.cols[idx.due_date]) || "";
    return da.localeCompare(db);
  });

  const unlabeled = ordered.every((p) => !classifyLabel(p.cols[idx.label]));
  const seqKinds = unlabeled ? sequenceKinds(ordered.length) : null;
  // Mixed labeled/unlabeled (e.g. N1): assign remaining unlabeled by position
  const mixedSeqFallback = ["prepayment", "design", "engineering", "fat", "sat", "fac"];
  let mixedSeqIdx = 0;

  for (let pi = 0; pi < ordered.length; pi++) {
    const { lineIndex, cols } = ordered[pi];
    const existingMid = (cols[idx.milestone_id] || "").trim();
    const label = cols[idx.label] || "";
    const projectName = cols[idx.project_name];

    // Keep existing FBK (or any) links
    if (existingMid) {
      report.push({
        project: projectName,
        label: label || "(unlabeled)",
        status: "kept-existing",
        milestoneId: existingMid,
      });
      continue;
    }

    let kind = classifyLabel(label);
    if (!kind && seqKinds) kind = seqKinds[pi];
    if (!kind) {
      // Skip kinds already taken by labeled siblings later in the list
      const labeledKinds = new Set(
        ordered.map((p) => classifyLabel(p.cols[idx.label])).filter(Boolean),
      );
      while (
        mixedSeqIdx < mixedSeqFallback.length &&
        labeledKinds.has(mixedSeqFallback[mixedSeqIdx])
      ) {
        mixedSeqIdx += 1;
      }
      kind = mixedSeqFallback[mixedSeqIdx++] ?? null;
    }

    let linked = kind ? pickDeadline(kind, label, dls) : null;

    // Metlen SAT → activity fallback
    if (kind === "sat" && (!linked || scoreDeadline(kind, linked.name, label) < 7)) {
      const fb = pickSatFallback(label, projectId);
      if (fb) linked = fb;
    }

    // Avoid double-linking the same deadline when multiple payments compete
    // (e.g. Design approval + Engineering complete same day → different deadlines)
    if (linked && usedDeadlineIds.has(linked.id) && kind !== "design") {
      // try next-best for this kind
      const alternates = dls
        .map((d) => ({ d, s: scoreDeadline(kind, d.name, label) }))
        .filter((x) => x.s > 0 && !usedDeadlineIds.has(x.d.id))
        .sort((a, b) => b.s - a.s);
      if (alternates.length) linked = alternates[0].d;
    }

    if (!linked) {
      report.push({
        project: projectName,
        label: label || `(seq ${pi + 1})`,
        status: "unmatched",
        kind,
      });
      continue;
    }

    usedDeadlineIds.add(linked.id);
    cols[idx.milestone_id] = linked.id;
    // Align due_date with the linked gantt event
    cols[idx.due_date] = formatCsvDate(linked.date);
    lines[lineIndex] = joinCsvLine(cols);

    report.push({
      project: projectName,
      label: label || `(seq ${pi + 1}/${kind})`,
      status: "linked",
      milestone: linked.name,
      date: linked.date,
      milestoneId: linked.id,
    });
  }
}

fs.writeFileSync(CSV_PATH, lines.join("\n"), "utf8");
console.log(JSON.stringify(report, null, 2));

const linked = report.filter((r) => r.status === "linked").length;
const kept = report.filter((r) => r.status === "kept-existing").length;
const unmatched = report.filter((r) => r.status === "unmatched").length;
console.log(
  `\nDone. linked=${linked} kept-existing=${kept} unmatched=${unmatched} skipped-projects=${SKIP_PROJECTS.size}`,
);
