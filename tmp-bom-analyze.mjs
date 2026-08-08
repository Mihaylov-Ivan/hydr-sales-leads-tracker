import fs from "fs";
import path from "path";

const base =
  "c:/Repos/hydr-sales-leads-tracker/templates/warehouse-data/MoneyWorks_Core_Warehouse_CSV/tables";

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  function split(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ",") {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
    }
    out.push(cur);
    return out;
  }
  const h = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cols = split(l);
    const o = {};
    h.forEach((x, i) => {
      o[x] = cols[i] ?? "";
    });
    return o;
  });
}

function num(x) {
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const prod = parseCsv(fs.readFileSync(path.join(base, "PROD.csv"), "utf8"));
const rows = parseCsv(fs.readFileSync(path.join(base, "PROD_ROWS.csv"), "utf8"));
const vars = parseCsv(fs.readFileSync(path.join(base, "PROD_VARS.csv"), "utf8"));
const cels = parseCsv(fs.readFileSync(path.join(base, "PROD_CELS.csv"), "utf8"));

console.log("PROD", prod.length, "ROWS", rows.length, "VARS", vars.length, "CELS", cels.length);
console.log("unique outputs", new Set(prod.map((p) => `${p.GRUPA}|${p.STOKA}`)).size);
console.log("PR_GRUPA", [...new Set(prod.map((p) => p.PR_GRUPA))].filter(Boolean));
console.log("STP_TIP", [...new Set(prod.map((p) => p.STP_TIP))]);
console.log("row TIP", Object.fromEntries(
  Object.entries(
    rows.reduce((a, r) => {
      a[r.TIP || "(empty)"] = (a[r.TIP || "(empty)"] || 0) + 1;
      return a;
    }, {}),
  ),
));

const rowsByStp = new Map();
for (const r of rows) {
  if (!rowsByStp.has(r.DT_STP)) rowsByStp.set(r.DT_STP, []);
  rowsByStp.get(r.DT_STP).push(r);
}
const varsByStp = new Map();
for (const v of vars) {
  if (!varsByStp.has(v.DT_STP)) varsByStp.set(v.DT_STP, []);
  varsByStp.get(v.DT_STP).push(v);
}
const celsByVar = new Map();
for (const c of cels) {
  if (!celsByVar.has(c.DT_VAR)) celsByVar.set(c.DT_VAR, []);
  celsByVar.get(c.DT_VAR).push(c);
}
const rowById = new Map(rows.map((r) => [r.DT_ROW, r]));

let withCells = 0;
let withRowsOnly = 0;
let empty = 0;
const samples = [];

for (const p of prod) {
  const rs = (rowsByStp.get(p.DT_STP) || []).filter((r) => r.TIP === "S");
  const vs = varsByStp.get(p.DT_STP) || [];
  const v = vs.find((x) => num(x.KOLICH) > 0) || vs[0];
  const comps = new Map();
  if (v) {
    for (const c of celsByVar.get(v.DT_VAR) || []) {
      const row = rowById.get(c.DT_ROW);
      if (!row || row.TIP !== "S") continue;
      const vQty = num(v.KOLICH) || 1;
      const q = num(c.KOLICH) / vQty;
      const key = `${row.GRUPA}|${row.STOKA}`;
      comps.set(key, (comps.get(key) || 0) + q);
    }
  }
  if (comps.size > 0) withCells++;
  else if (rs.length > 0) withRowsOnly++;
  else empty++;

  if (samples.length < 10 && (comps.size > 0 || rs.length > 3)) {
    samples.push({
      output: p.STOKA,
      grupa: p.GRUPA,
      pr: p.PR_GRUPA,
      produced: num(p.KOLICH_PRD),
      components: comps.size || rs.length,
      sample: [...comps.entries()].slice(0, 4).map(([k, q]) => [k, +q.toFixed(4)]),
      rowNames: rs.slice(0, 3).map((r) => r.STOKA),
    });
  }
}

console.log({ withCells, withRowsOnly, empty, total: prod.length });
console.log(JSON.stringify(samples, null, 2));

// Aggregate by output name: multiple PROD docs for same STOKA?
const byOut = new Map();
for (const p of prod) {
  const k = `${p.GRUPA}|${p.STOKA}`;
  byOut.set(k, (byOut.get(k) || 0) + 1);
}
const multi = [...byOut.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log("outputs with multiple PROD docs", multi.length, multi.slice(0, 10));
