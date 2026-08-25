import fs from "fs";
import path from "path";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u201c\u201d\u2018\u2019`]/g, '"')
    .replace(/[×xх]/gi, "x")
    .replace(/[–—−]/g, "-")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const root = process.cwd();
const seed = JSON.parse(
  fs.readFileSync(
    path.join(root, "templates/warehouse-data/sebestoynost-500kw-z-series-seed.json"),
    "utf8",
  ),
);
const reorg = JSON.parse(
  fs.readFileSync(
    path.join(root, "templates/warehouse-data/WH_data_reorganised_updated.json"),
    "utf8",
  ),
);

const byName = new Map();
const bySku = new Map();
function addName(n, a) {
  if (!n) return;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(a);
}
function addSku(sku, a) {
  const s = String(sku || "").trim();
  if (!s || s === "-") return;
  if (!bySku.has(s)) bySku.set(s, []);
  bySku.get(s).push(a);
}

for (const a of reorg.articles) {
  addName(norm(a.name), a);
  addName(norm(a.name_original), a);
  addSku(a.sku, a);
  addSku(a.code, a);
  for (const ref of a.source_refs || []) {
    addName(norm(ref.name), a);
    addSku(ref.code, a);
  }
}

const flat = [];
for (const m of seed.modules) {
  for (const g of m.groups) {
    for (const it of g.items) {
      flat.push({ ...it, module: m.name, group: g.name });
    }
  }
}

let matchedSku = 0;
let matchedName = 0;
let matchedFuzzy = 0;
const matches = [];
const unmatched = [];

for (const it of flat) {
  let hit = null;
  let how = null;
  if (it.sku && bySku.has(String(it.sku))) {
    hit = bySku.get(String(it.sku))[0];
    how = "sku";
    matchedSku += 1;
  } else {
    const n = norm(it.name);
    if (byName.has(n)) {
      hit = byName.get(n)[0];
      how = "name";
      matchedName += 1;
    } else {
      const key = n.slice(0, 48);
      for (const [k, v] of byName) {
        if (k.length < 12) continue;
        if (k.includes(key) || key.includes(k.slice(0, 48))) {
          hit = v[0];
          how = "fuzzy";
          matchedFuzzy += 1;
          break;
        }
      }
    }
  }
  if (hit) {
    matches.push({
      excel: it.name,
      sku: it.sku,
      how,
      wh: hit.name,
      categoryId: hit.category_id,
      whSku: hit.sku || hit.code || null,
    });
  } else {
    unmatched.push({
      name: it.name,
      sku: it.sku,
      module: it.module,
      group: it.group,
      qty: it.qty,
    });
  }
}

const report = {
  total: flat.length,
  matchedSku,
  matchedName,
  matchedFuzzy,
  unmatchedCount: unmatched.length,
  matches,
  unmatched,
};
fs.writeFileSync(
  path.join(root, "templates/warehouse-data/_sebestoynost_match_report.json"),
  JSON.stringify(report, null, 2),
);
console.log({
  total: report.total,
  matchedSku,
  matchedName,
  matchedFuzzy,
  unmatched: unmatched.length,
});
console.log("unmatched (first 40):");
unmatched.slice(0, 40).forEach((u) =>
  console.log(`  [${u.module}/${u.group}] ${u.name} sku=${u.sku || "-"}`),
);
