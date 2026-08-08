import fs from "fs";
import { createRequire } from "module";

// reuse parse from build by duplicating minimal
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let row = [];
  let field = "";
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows[0];
  return rows.slice(1).filter((r) => r.some((x) => x !== "")).map((r) => {
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = r[idx] ?? "";
    });
    return o;
  });
}

const defs = parseCsv(
  fs.readFileSync(
    "templates/warehouse-data/MoneyWorks_Core_Warehouse_CSV/tables/STOKI_DEF.csv",
    "utf8",
  ),
);
const byCode = new Map();
for (const d of defs) {
  const c = d.CODE || "(empty)";
  if (!byCode.has(c)) byCode.set(c, []);
  byCode.get(c).push(`${d.STOKA} @ ${d.GRUPA}`);
}
const dups = [...byCode.entries()]
  .filter(([, v]) => v.length > 1)
  .sort((a, b) => b[1].length - a[1].length);
console.log("dup codes", dups.length);
console.log(
  "top",
  dups.slice(0, 8).map(([k, v]) => ({ code: JSON.stringify(k), n: v.length, sample: v.slice(0, 4) })),
);
console.log("empty", (byCode.get("(empty)") || []).length);
