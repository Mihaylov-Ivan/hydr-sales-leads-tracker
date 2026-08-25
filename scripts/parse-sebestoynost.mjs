import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const root = process.cwd();
const xlsx = fs.readdirSync(root).find((x) => x.includes("500kW") && x.endsWith(".xlsx"));
if (!xlsx) {
  console.error("Excel file not found");
  process.exit(1);
}
console.log("file:", xlsx);

const wb = XLSX.readFile(path.join(root, xlsx));
const sheetName = wb.SheetNames[0];
const cost = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
  header: 1,
  defval: null,
});

/** Known module / assembly section titles from the cost sheet */
const MODULE_HEADERS = new Set([
  "Електролизьор (500kW)",
  "Съдове",
  "Скрубер",
  "Газ анализ",
  "Водоподготовка",
  "Ел. шкаф",
  "Ел шкаф",
  "Рамка",
  "Метална конструкция",
  "Тръбни връзки",
  "Услуги",
]);

const SECTION_ALLCAPS = (name) => {
  // Bulgarian all-caps section labels like КРЕПЕЖИ, БУФЕРНИ СЪДОВЕ
  const letters = name.replace(/[^A-Za-zА-Яа-я]/g, "");
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase();
};

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

  const isHeader =
    (!hasUnit && !hasQty && !hasPrice) ||
    (!hasUnit && !hasQty && !hasCode && SECTION_ALLCAPS(name)) ||
    MODULE_HEADERS.has(name) ||
    (SECTION_ALLCAPS(name) && !hasUnit);

  if (isHeader && !hasUnit) {
    sections.push({
      row: i + 1,
      name,
      finalPrice: typeof finalPrice === "number" ? finalPrice : null,
      firm: firm != null ? String(firm) : null,
    });
    if (MODULE_HEADERS.has(name) || (typeof finalPrice === "number" && finalPrice > 1000 && !hasUnit)) {
      currentModule = name;
      currentGroup = null;
    } else if (SECTION_ALLCAPS(name)) {
      currentGroup = name;
    } else {
      currentGroup = name;
    }
    continue;
  }

  if (!hasUnit && !hasQty && !hasPrice) continue;

  items.push({
    row: i + 1,
    name,
    code: hasCode ? String(code).trim() : null,
    unitPrice: hasPrice ? price : null,
    unit: hasUnit ? String(unit).trim() : null,
    discount: typeof r[4] === "number" ? r[4] : 0,
    netPrice: typeof r[5] === "number" ? r[5] : null,
    qty: hasQty ? qty : 0,
    finalPrice: typeof finalPrice === "number" ? finalPrice : null,
    firm: firm != null ? String(firm) : null,
    module: currentModule,
    group: currentGroup,
  });
}

// Also parse Модули sheet for cleaner structure
const modulesSheet = wb.Sheets["Модули"];
const modRows = modulesSheet
  ? XLSX.utils.sheet_to_json(modulesSheet, { header: 1, defval: null })
  : [];
const moduleItems = [];
let modModule = null;
let modGroup = null;
for (let i = 2; i < modRows.length; i++) {
  const r = modRows[i];
  if (!r || r[0] == null) continue;
  const name = String(r[0]).trim();
  const qty = r[1];
  const unit = r[2];
  const group = r[3];
  const unitPrice = r[4];
  const finalPrice = r[5];
  const hasUnit = unit != null && String(unit).trim() !== "";
  const hasQty = typeof qty === "number";
  if (!hasUnit && !hasQty) {
    if (name) {
      modModule = name;
      modGroup = null;
    }
    continue;
  }
  if (group != null && String(group).trim()) {
    modGroup = String(group).trim();
  }
  moduleItems.push({
    row: i + 1,
    name,
    qty: hasQty ? qty : 0,
    unit: hasUnit ? String(unit).trim() : null,
    group: modGroup,
    module: modModule,
    unitPrice: typeof unitPrice === "number" ? unitPrice : null,
    finalPrice: typeof finalPrice === "number" ? finalPrice : null,
  });
}

const outDir = path.join(root, "templates", "warehouse-data");
fs.mkdirSync(outDir, { recursive: true });
const out = {
  sourceFile: xlsx,
  sheet: sheetName,
  sections,
  items,
  moduleItems,
  stats: {
    sections: sections.length,
    items: items.length,
    moduleItems: moduleItems.length,
    sumFinal: items.reduce((s, i) => s + (i.finalPrice || 0), 0),
    modules: [...new Set(items.map((i) => i.module).filter(Boolean))],
    groups: [...new Set(items.map((i) => i.group).filter(Boolean))],
    moduleGroups: [...new Set(moduleItems.map((i) => `${i.module} / ${i.group}`))],
  },
};
fs.writeFileSync(
  path.join(outDir, "_sebestoynost_parsed.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out.stats, null, 2));
console.log("sections sample:");
sections.slice(0, 80).forEach((s) =>
  console.log(s.row, JSON.stringify(s.name), s.finalPrice),
);
