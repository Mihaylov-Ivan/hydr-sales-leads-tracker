import fs from "fs";

function parseCsv(text) {
  const rows = [];
  let i = 0,
    row = [],
    field = "",
    inQuotes = false;
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
  return rows
    .slice(1)
    .filter((r) => r.some((x) => x !== ""))
    .map((r) => {
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
).filter((r) => String(r.IS_ACTIVE || "Y").toUpperCase() !== "N");

const byId = new Map();
for (const d of defs) {
  const id = d.ITEM_ID || "(empty)";
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(`${d.STOKA} @ ${d.GRUPA}`);
}
const dups = [...byId.entries()]
  .filter(([, v]) => v.length > 1)
  .sort((a, b) => b[1].length - a[1].length);
console.log("active defs", defs.length);
console.log("unique item_ids", byId.size);
console.log("dup item_ids", dups.length);
console.log(dups.slice(0, 10));

const cat = JSON.parse(
  fs.readFileSync(
    "templates/warehouse-data/WH_data_reorganised_updated.json",
    "utf8",
  ),
);
const multi = cat.articles.filter((a) => a.source_refs.length > 1);
console.log("multi-ref articles", multi.length);
console.log(
  multi
    .slice(0, 15)
    .map((a) => ({
      n: a.source_refs.length,
      name: a.name,
      cat: a.category_id,
      refs: a.source_refs.map((r) => r.group),
    })),
);
