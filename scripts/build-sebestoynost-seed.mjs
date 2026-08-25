import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const root = process.cwd();
const xlsx = fs
  .readdirSync(root)
  .find((x) => x.includes("500kW") && x.endsWith(".xlsx"));
if (!xlsx) {
  console.error("Excel file not found");
  process.exit(1);
}

const wb = XLSX.readFile(path.join(root, xlsx));
const cost = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: null,
});

/** Top-level assemblies / modules in the cost sheet (parent groups). */
const TOP_MODULES = [
  "Електролизьор (500kW)",
  "Съдове",
  "Тръбни връзки",
  "Ел. табло",
  "Газ анализ табло",
  "Кабели",
  "Пречистване на вода",
  "Други",
];

function isAllCapsLabel(name) {
  const letters = name.replace(/[^A-Za-zА-Яа-яЁёІі]/g, "");
  if (letters.length < 2) return false;
  return letters === letters.toLocaleUpperCase("bg");
}

function titleCaseBg(name) {
  if (!name) return name;
  // Keep short all-caps acronyms; otherwise normalize display
  if (name.length <= 3) return name;
  return name.charAt(0).toLocaleUpperCase("bg") + name.slice(1);
}

const items = [];
const sections = [];
let currentModule = null;
let currentGroup = null;

for (let i = 1; i < cost.length; i++) {
  const r = cost[i];
  if (!r || r[0] == null || String(r[0]).trim() === "") continue;
  const name = String(r[0]).trim();
  const code = r[1];
  const price = r[2];
  const unit = r[3];
  const qty = r[6];
  const finalPrice = r[7];
  const firm = r[8];

  const hasUnit = unit != null && String(unit).trim() !== "";
  const hasPrice = typeof price === "number";
  const hasQty = typeof qty === "number";
  const hasCode =
    code != null && String(code).trim() !== "" && String(code).trim() !== "-";

  const isTopModule = TOP_MODULES.includes(name);
  const looksLikeHeader =
    isTopModule ||
    (!hasUnit && !hasQty && !hasPrice) ||
    (!hasUnit && isAllCapsLabel(name));

  if (looksLikeHeader && !hasUnit) {
    sections.push({
      row: i + 1,
      name,
      finalPrice: typeof finalPrice === "number" ? finalPrice : null,
      isTopModule,
    });
    if (isTopModule) {
      currentModule = name;
      currentGroup = "Основни части";
    } else {
      currentGroup = titleCaseBg(name);
    }
    continue;
  }

  if (!hasUnit && !hasQty && !hasPrice) continue;

  items.push({
    row: i + 1,
    name,
    code: hasCode ? String(code).trim() : null,
    unitPriceExVat: hasPrice ? price : null,
    unit:
      hasUnit
        ? String(unit).trim()
        : "бр.",
    discount: typeof r[4] === "number" ? r[4] : 0,
    netPriceExVat: typeof r[5] === "number" ? r[5] : null,
    qty: hasQty ? qty : 0,
    finalPriceExVat: typeof finalPrice === "number" ? finalPrice : null,
    firm: firm != null && String(firm).trim() !== "-" ? String(firm).trim() : null,
    module: currentModule ?? "Други",
    group: currentGroup ?? "Основни части",
  });
}

// Aggregate identical name+unit within same module/group (keep first prices)
function normKey(name) {
  return name
    .toLowerCase()
    .replace(/["""'']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const aggregated = new Map();
for (const it of items) {
  const key = `${it.module}||${it.group}||${normKey(it.name)}||${it.unit}`;
  const prev = aggregated.get(key);
  if (!prev) {
    aggregated.set(key, { ...it });
    continue;
  }
  // Prefer non-zero qty / price
  if ((prev.qty ?? 0) === 0 && (it.qty ?? 0) > 0) {
    aggregated.set(key, { ...it });
  }
}

const uniqueItems = [...aggregated.values()];

// Build group tree: parent = module, child = subgroup
const tree = new Map();
for (const it of uniqueItems) {
  if (!tree.has(it.module)) tree.set(it.module, new Map());
  const g = tree.get(it.module);
  if (!g.has(it.group)) g.set(it.group, []);
  g.get(it.group).push(it);
}

const outDir = path.join(root, "templates", "warehouse-data");
const seed = {
  sourceFile: xlsx,
  project: {
    name: "Example 500kW Z-Series",
    series: "Z Series",
    sizeKw: 500,
    client: "Hydrogenera (BOM baseline)",
    city: "Sofia",
    country: "Bulgaria",
    notes:
      "Baseline manufacturing BOM from себестойност workbook. Materials are recorded as used history only (not on-hand stock).",
  },
  modules: [...tree.entries()].map(([moduleName, groups]) => ({
    name: moduleName,
    groups: [...groups.entries()].map(([groupName, groupItems]) => ({
      name: groupName,
      items: groupItems.map((it) => ({
        name: it.name,
        sku: it.code,
        unit: it.unit,
        qty: it.qty ?? 0,
        unitCostExVat: it.netPriceExVat ?? it.unitPriceExVat ?? 0,
        lineCostExVat: it.finalPriceExVat ?? 0,
        supplier: it.firm,
        sourceRow: it.row,
      })),
    })),
  })),
  stats: {
    modules: tree.size,
    subgroups: [...tree.values()].reduce((s, g) => s + g.size, 0),
    items: uniqueItems.length,
    itemsWithQty: uniqueItems.filter((i) => (i.qty ?? 0) > 0).length,
    totalExVat: uniqueItems.reduce((s, i) => s + (i.finalPriceExVat || 0), 0),
  },
};

fs.writeFileSync(
  path.join(outDir, "sebestoynost-500kw-z-series-seed.json"),
  JSON.stringify(seed, null, 2),
);

console.log(JSON.stringify(seed.stats, null, 2));
for (const m of seed.modules) {
  const n = m.groups.reduce((s, g) => s + g.items.length, 0);
  const costSum = m.groups.reduce(
    (s, g) => s + g.items.reduce((a, i) => a + (i.lineCostExVat || 0), 0),
    0,
  );
  console.log(`\n## ${m.name} (${n} items, €${costSum.toFixed(2)})`);
  for (const g of m.groups) {
    console.log(`  - ${g.name}: ${g.items.length}`);
  }
}
