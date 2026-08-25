/**
 * Quick smoke test for себестойност seed apply (no React).
 * Run: node scripts/smoke-sebestoynost-seed.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

// Inline minimal port of apply logic checks against seed JSON structure
const seed = JSON.parse(
  fs.readFileSync(
    path.join("templates/warehouse-data/sebestoynost-500kw-z-series-seed.json"),
    "utf8",
  ),
);

let modules = 0;
let subgroups = 0;
let items = 0;
let withQty = 0;
let totalEx = 0;
for (const m of seed.modules) {
  modules += 1;
  for (const g of m.groups) {
    subgroups += 1;
    for (const it of g.items) {
      items += 1;
      if (it.qty > 0) withQty += 1;
      totalEx += it.lineCostExVat || 0;
    }
  }
}

const match = JSON.parse(
  fs.readFileSync(
    path.join("templates/warehouse-data/_sebestoynost_match_report.json"),
    "utf8",
  ),
);

console.log({
  project: seed.project.name,
  modules,
  subgroups,
  items,
  withQty,
  totalExVat: Math.round(totalEx * 100) / 100,
  catalogMatch: {
    total: match.total,
    matchedSku: match.matchedSku,
    matchedName: match.matchedName,
    matchedFuzzy: match.matchedFuzzy,
    unmatched: match.unmatchedCount,
  },
});

if (modules !== 8 || items !== 310) {
  console.error("Unexpected seed shape");
  process.exit(1);
}
console.log("OK");
