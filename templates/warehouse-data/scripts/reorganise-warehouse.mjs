/**
 * Warehouse catalog reorganisation (decisions: Tools A, Vendor A, System A).
 * Reads MoneyWorks Core CSVs → writes mapping + reorganised catalog + change report.
 * No data loss: every article kept; merges only duplicate tools with per-location qty.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CORE = path.join(ROOT, "MoneyWorks_Core_Warehouse_CSV", "tables");
const OUT_JSON = path.join(ROOT, "WH_data_reorganised_updated.json");
const OUT_REPORT = path.join(ROOT, "WH_reorganisation_change_report.md");

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
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
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.some((x) => x !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, idx) => {
        o[h] = r[idx] ?? "";
      });
      return o;
    });
}

function loadCsv(name) {
  return parseCsv(fs.readFileSync(path.join(CORE, name), "utf8"));
}

// ---------------------------------------------------------------------------
// Target taxonomy
// ---------------------------------------------------------------------------
const TAXONOMY = [
  {
    id: "01-piping-fluid",
    code: "01",
    name: "Тръби и флуидни връзки",
    name_en: "Piping & fluid",
    children: [
      { id: "01.01-pipes", code: "01.01", name: "Тръби" },
      { id: "01.02-weld-fittings", code: "01.02", name: "Фитинги за заваряване" },
      { id: "01.03-thread-fittings", code: "01.03", name: "Фитинги на резба" },
      { id: "01.04-flanges", code: "01.04", name: "Фланци" },
      { id: "01.05-valves", code: "01.05", name: "Кранове, вентили и клапани" },
      { id: "01.06-actuators", code: "01.06", name: "Актуатори" },
      { id: "01.07-pp-brass-chrome", code: "01.07", name: "PP, месинг, хром връзки" },
      { id: "01.08-hoses", code: "01.08", name: "Маркучи и гъвкави връзки" },
      { id: "01.09-armatures", code: "01.09", name: "Арматури" },
    ],
  },
  {
    id: "02-fasteners",
    code: "02",
    name: "Крепежи",
    name_en: "Fasteners",
    children: [
      { id: "02.01-bolts-screws", code: "02.01", name: "Болтове и винтове" },
      { id: "02.02-nuts", code: "02.02", name: "Гайки" },
      { id: "02.03-washers", code: "02.03", name: "Шайби" },
      { id: "02.04-other-fasteners", code: "02.04", name: "Други крепежи" },
    ],
  },
  {
    id: "03-electrical",
    code: "03",
    name: "Електроника и електротехника",
    name_en: "Electrical",
    children: [
      { id: "03.01-cables", code: "03.01", name: "Кабели" },
      { id: "03.02-terminals", code: "03.02", name: "Клеми" },
      { id: "03.03-lugs-glands", code: "03.03", name: "Кабелни накрайници и уплътнения" },
      { id: "03.04-channels", code: "03.04", name: "Кабелни канали" },
      { id: "03.05-power-supplies", code: "03.05", name: "Захранвания" },
      { id: "03.06-pcbs", code: "03.06", name: "Платки" },
      { id: "03.07-other-electronics", code: "03.07", name: "Друга електроника" },
    ],
  },
  {
    id: "04-sensors-devices",
    code: "04",
    name: "Сензори и устройства",
    name_en: "Sensors & devices",
    children: [
      { id: "04.01-sensors", code: "04.01", name: "Сензори" },
      { id: "04.02-devices", code: "04.02", name: "Устройства" },
      { id: "04.03-gas-analyzer", code: "04.03", name: "Газ анализатор (компоненти)" },
    ],
  },
  {
    id: "05-process",
    code: "05",
    name: "Процесно оборудване",
    name_en: "Process assemblies",
    children: [
      { id: "05.01-electrolyzer", code: "05.01", name: "Електролизьор — части" },
      { id: "05.02-scrubber", code: "05.02", name: "Очиска — части и съдове" },
      { id: "05.03-metal-hydride", code: "05.03", name: "Металхидрид — части" },
      { id: "05.04-water-treatment", code: "05.04", name: "Пречистване на вода" },
      { id: "05.05-vessels", code: "05.05", name: "Съдове" },
      { id: "05.06-metal-parts", code: "05.06", name: "Метални елементи" },
      { id: "05.07-housings", code: "05.07", name: "Корпуси" },
    ],
  },
  {
    id: "06-tools-machines",
    code: "06",
    name: "Инструменти и машини",
    name_en: "Tools & machines",
    children: [
      { id: "06.01-hand-tools", code: "06.01", name: "Ръчни инструменти" },
      { id: "06.02-machines", code: "06.02", name: "Машини" },
      { id: "06.03-shop-equipment", code: "06.03", name: "Цехово оборудване" },
    ],
  },
  {
    id: "07-consumables",
    code: "07",
    name: "Консумативи",
    name_en: "Consumables",
    children: [{ id: "07.01-consumables", code: "07.01", name: "Консумативи" }],
  },
  {
    id: "08-misc",
    code: "08",
    name: "Услуги, разни и неактивни",
    name_en: "Services / misc / inactive",
    children: [
      { id: "08.01-services", code: "08.01", name: "Услуги" },
      { id: "08.02-misc", code: "08.02", name: "Разни" },
      { id: "08.03-inactive", code: "08.03", name: "Неактивни" },
      { id: "08.04-invoices-admin", code: "08.04", name: "Административни / за фактури" },
    ],
  },
];

const CAT_BY_ID = new Map();
for (const root of TAXONOMY) {
  CAT_BY_ID.set(root.id, root);
  for (const ch of root.children) CAT_BY_ID.set(ch.id, { ...ch, parent: root.id });
}

/** Known vendor / firm group names (children of "1. Фирми" plus standalone firm-like). */
const KNOWN_VENDORS = new Set([
  "Крисметал",
  "Genebre",
  "Унител",
  "Шрак техник ЕООД",
  "Нидакс",
  "Жиланови",
  "Ивда Гео",
  "ИТТ",
  "ЛД",
  "Сити склад",
  "1) Грийн Иновейшън АД",
]);

const SYSTEM_TAG_RULES = [
  {
    tag: "electrolyzer",
    label: "Електролизьор",
    match: (g, path) =>
      /електролиз/i.test(g) || /електролиз/i.test(path.join(" ")),
  },
  {
    tag: "scrubber",
    label: "Очиска",
    match: (g, path) => /очиск/i.test(g) || /очиск/i.test(path.join(" ")),
  },
  {
    tag: "metal-hydride",
    label: "Металхидрид",
    match: (g) => /металхидрид/i.test(g) || /^мх$/i.test(g),
  },
  {
    tag: "water-treatment",
    label: "Пречистване на вода",
    match: (g) => /пречистване на вода/i.test(g),
  },
  {
    tag: "gas-analyzer",
    label: "Газ анализатор",
    match: (g, path) =>
      /газ анализ/i.test(g) ||
      /табло газ/i.test(g) ||
      /газ анализ/i.test(path.join(" ")),
  },
];

const TOOL_LOCATION_GROUPS = new Set([
  "Хале  - инструменти",
  "Хале - инструменти",
  "Производствен цех - инструменти",
  "Фрезовъчен цех",
  "3. Инструменти",
]);

const TOOL_FIRST_WORDS = new Set([
  "отвертки",
  "отвертка",
  "клещи",
  "пила",
  "чук",
  "чирак",
  "макетен",
  "ножици",
  "нож",
  "ключ",
  "ключове",
  "стяга",
  "трион",
  "бормашина",
  "ъглошлайф",
  "мултиметър",
  "ниво",
  "ролетка",
  "шублер",
  "накрайник",
  "накрайници",
  "сменяеми",
]);

// Explicit old-group → new category (leaf id). Unlisted groups use heuristics.
const EXPLICIT_MAP = {
  // Piping
  "2. Тръбни връзки": "01-piping-fluid",
  "2.1. Тръби": "01.01-pipes",
  "2.2. Фитинги за заваряване": "01.02-weld-fittings",
  "2.3. Фитинги на резба": "01.03-thread-fittings",
  "2.4. Фланци": "01.04-flanges",
  "2.5. Кранове": "01.05-valves",
  "2.5.1. Кранове на фланци": "01.05-valves",
  "2.5.2. Кранове на заварка": "01.05-valves",
  "2.5.3. Кранове на резба": "01.05-valves",
  "2.5.4. Вентили": "01.05-valves",
  "2.5.5. Клапани": "01.05-valves",
  "2.5.6. Акутатори": "01.06-actuators",
  "2.6. Арматури": "01.09-armatures",
  "2.7. PP, Месинг, Хром връзки": "01.07-pp-brass-chrome",
  "2.8. Маркучи": "01.08-hoses",
  "Преходи на резба": "01.03-thread-fittings",
  "Фитинги - Щуцер на резба": "01.03-thread-fittings",
  "Газ анализ - Фитинги": "01.03-thread-fittings",

  // Fasteners
  "4. Крепежи": "02-fasteners",
  М3: "02.01-bolts-screws",
  М5: "02.01-bolts-screws",
  М6: "02.01-bolts-screws",
  М8: "02.01-bolts-screws",
  М10: "02.01-bolts-screws",
  М12: "02.01-bolts-screws",
  М16: "02.01-bolts-screws",
  "Други (Крепежи)": "02.04-other-fasteners",
  "1.1.2. Крепежи (Електролизьор)": "02.04-other-fasteners",
  "Газ анализ - Крепежи": "02.04-other-fasteners",

  // Electrical
  "6. Електроника": "03-electrical",
  "7. Кабели": "03.01-cables",
  Клеми: "03.02-terminals",
  "Кабелни накрайници, обувки": "03.03-lugs-glands",
  "Кабелни Канали": "03.04-channels",
  Захранвания: "03.05-power-supplies",
  "Платки - Green Innovation": "03.06-pcbs",
  "2) Материали за платки": "03.06-pcbs",
  "Други (Електроника)": "03.07-other-electronics",

  // Sensors / devices
  Сензори: "04.01-sensors",
  "5. Устройства": "04.02-devices",
  "8. Табло газ анализатор": "04.03-gas-analyzer",

  // Process
  "1.1 Електролизьор": "05.01-electrolyzer",
  "1.1.1. Части (Електролизьор)": "05.01-electrolyzer",
  "1.1.3. Други (Електролизьор)": "05.01-electrolyzer",
  "1.2. Очиска": "05.02-scrubber",
  "1.2.1. Части (Очиска)": "05.02-scrubber",
  "1.2.2 Съдове (Очиска)": "05.02-scrubber",
  "1.3. Металхидрид": "05.03-metal-hydride",
  Металхидрид: "05.03-metal-hydride",
  "1. Пречистване на вода": "05.04-water-treatment",
  "1. Съдове": "05.05-vessels",
  "4. Съдове": "05.05-vessels",
  "3. Метални Елементи": "05.06-metal-parts",
  "2. Корпуси": "05.07-housings",

  // Tools / machines
  "3. Инструменти": "06.01-hand-tools",
  "Хале  - инструменти": "06.01-hand-tools",
  "Производствен цех - инструменти": "06.01-hand-tools",
  "Фрезовъчен цех": "06.01-hand-tools",
  Машини: "06.02-machines",

  // Consumables
  "2. Консумативи": "07.01-consumables",
  "3. Консумативи": "07.01-consumables",

  // Misc
  "4. Услуги": "08.01-services",
  "0. Разни": "08.02-misc",
  "9. Други": "08.02-misc",
  Неактивни: "08.03-inactive",
  "0. За фактури": "08.04-invoices-admin",
  "500": "08.02-misc",
  "951038": "08.02-misc",

  // Structural / org parents → park under misc or parent type (items remapped by leaf)
  "1. Фирми": "08.02-misc",
  Материали: "08.02-misc",
  "1) Грийн Иновейшън АД": "03.06-pcbs",
};

// Thread-fitting subgroups often named by type
const THREAD_FITTING_HINTS = [
  "преход",
  "коляно",
  "тройник",
  "нипел",
  "муфа",
  "холендър",
  "тапа",
  "щуцер",
  "връзка",
];

function stripNumberPrefix(name) {
  return name.replace(/^\d+[.)]\s*/, "").replace(/^\d+(\.\d+)*\.?\s*/, "").trim();
}

function categorizeByHeuristics(groupName, parentName, pathNames) {
  const g = groupName;
  const low = g.toLowerCase();
  const pathLow = pathNames.join(" ").toLowerCase();

  if (EXPLICIT_MAP[g]) return EXPLICIT_MAP[g];

  // Size-only fastener groups
  if (/^м\d+$/i.test(g) || /^m\d+$/i.test(g)) return "02.01-bolts-screws";

  // Tool location groups
  if (TOOL_LOCATION_GROUPS.has(g) || /инструмент/i.test(g)) return "06.01-hand-tools";
  if (/машин/i.test(g)) return "06.02-machines";

  // Vendor folders → misc placeholder; items get vendor field + item-level reclass
  if (parentName === "1. Фирми" || KNOWN_VENDORS.has(g)) {
    return "08.02-misc"; // leaf items reclassified by name
  }

  if (/тръб/i.test(g)) return "01.01-pipes";
  if (/завар/i.test(g) && /фитинг/i.test(g)) return "01.02-weld-fittings";
  if (/фланц/i.test(g)) return "01.04-flanges";
  if (/кран|вентил|клапан/i.test(g)) return "01.05-valves";
  if (/акутатор|актуатор/i.test(g)) return "01.06-actuators";
  if (/pp|месинг|хром/i.test(low)) return "01.07-pp-brass-chrome";
  if (/маркуч|гъвкав/i.test(g)) return "01.08-hoses";
  if (/арmatur|армату/i.test(g)) return "01.09-armatures";
  if (THREAD_FITTING_HINTS.some((h) => low.includes(h)) || /фитинг/i.test(g)) {
    return "01.03-thread-fittings";
  }

  if (/болт|винт/i.test(g)) return "02.01-bolts-screws";
  if (/гайк/i.test(g)) return "02.02-nuts";
  if (/шайб/i.test(g)) return "02.03-washers";
  if (/крепеж/i.test(g)) return "02.04-other-fasteners";

  if (/кабел/i.test(g) && /канал/i.test(g)) return "03.04-channels";
  if (/кабел/i.test(g) && /(накрай|обув|gland)/i.test(low)) return "03.03-lugs-glands";
  if (/^кабел/i.test(g) || /кабели/i.test(g)) return "03.01-cables";
  if (/клем/i.test(g)) return "03.02-terminals";
  if (/захранв/i.test(g)) return "03.05-power-supplies";
  if (/платк/i.test(g)) return "03.06-pcbs";
  if (/електрон/i.test(g)) return "03.07-other-electronics";

  if (/сензор/i.test(g)) return "04.01-sensors";
  if (/устройство/i.test(g) || /устройства/i.test(g)) return "04.02-devices";
  if (/газ анализ/i.test(g)) return "04.03-gas-analyzer";

  if (/електролиз/i.test(g) || /електролиз/i.test(pathLow)) return "05.01-electrolyzer";
  if (/очиск/i.test(g) || /очиск/i.test(pathLow)) return "05.02-scrubber";
  if (/металхидрид/i.test(g)) return "05.03-metal-hydride";
  if (/пречистване/i.test(g)) return "05.04-water-treatment";
  if (/съдов/i.test(g) || /съдове/i.test(g)) return "05.05-vessels";
  if (/металн/i.test(g)) return "05.06-metal-parts";
  if (/корпус/i.test(g)) return "05.07-housings";

  if (/консуматив/i.test(g)) return "07.01-consumables";
  if (/услуг/i.test(g)) return "08.01-services";
  if (/неактив/i.test(g)) return "08.03-inactive";
  if (/фактур/i.test(g)) return "08.04-invoices-admin";
  if (/разн|други/i.test(g)) return "08.02-misc";

  // Parent-based fallback
  if (parentName && EXPLICIT_MAP[parentName]) return EXPLICIT_MAP[parentName];
  if (/тръбни връзки/i.test(pathLow)) return "01.03-thread-fittings";
  if (/крепеж/i.test(pathLow)) return "02.04-other-fasteners";
  if (/електрон/i.test(pathLow)) return "03.07-other-electronics";
  if (/кабел/i.test(pathLow)) return "03.01-cables";

  return "08.02-misc";
}

function systemTagsForGroup(groupName, pathNames) {
  const tags = [];
  for (const rule of SYSTEM_TAG_RULES) {
    if (rule.match(groupName, pathNames)) tags.push(rule.tag);
  }
  // Metal hydride group also held tools — still tag MH for items that stay there historically
  return tags;
}

function vendorFromGroup(groupName, parentName, pathNames) {
  if (KNOWN_VENDORS.has(groupName)) {
    return cleanVendorName(groupName);
  }
  if (parentName === "1. Фирми") return cleanVendorName(groupName);
  if (pathNames.includes("1. Фирми") && groupName !== "1. Фирми") {
    // deepest firm-ish leaf
    const firm = pathNames.find((p) => p !== "1. Фирми" && pathNames.indexOf(p) > pathNames.indexOf("1. Фирми"));
    if (firm) return cleanVendorName(firm === groupName ? groupName : firm);
    return cleanVendorName(groupName);
  }
  return null;
}

function cleanVendorName(name) {
  return stripNumberPrefix(name)
    .replace(/^\)\s*/, "")
    .replace(/^\d+\)\s*/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------
function normalizeName(raw) {
  let s = String(raw ?? "").trim();
  // unify quotes/inches
  s = s.replace(/[“”„]|``|''/g, '"').replace(/[`´]/g, '"');
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s+([,.;:])/g, "$1");
  s = s.replace(/-\s*$/g, "");
  // decimal comma in dimensions often intentional in BG — keep
  // Title-case first Cyrillic/Latin word if all-lower or all-upper short
  s = titleFirstWord(s);
  return s;
}

function titleFirstWord(s) {
  const m = s.match(/^(\S+)(.*)$/);
  if (!m) return s;
  let w = m[1];
  const rest = m[2];
  // Don't touch codes / all-caps part numbers longer than 2
  if (/^[A-Z0-9][A-Z0-9._-]{2,}$/.test(w) && !/[а-яА-Я]/.test(w)) return s;
  if (w === w.toLowerCase() || (w === w.toUpperCase() && /[а-яА-Яa-zA-Z]{3,}/.test(w))) {
    w = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // restore common abbreviations after lowercasing
    w = w.replace(/^Pp$/, "PP").replace(/^Din$/, "DIN").replace(/^Gi/, "GI");
  }
  return w + rest;
}

function softKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїґ]/gi, "");
}

function firstWord(name) {
  const n = normalizeName(name).toLowerCase();
  return n.split(/\s+/)[0] || "";
}

function looksLikeTool(name, oldGroup) {
  if (TOOL_LOCATION_GROUPS.has(oldGroup)) return true;
  if (/инструмент/i.test(oldGroup)) return true;
  // MH / milling often mixed tools
  if (
    (oldGroup === "Металхидрид" || oldGroup === "Фрезовъчен цех") &&
    TOOL_FIRST_WORDS.has(firstWord(name))
  ) {
    return true;
  }
  return TOOL_FIRST_WORDS.has(firstWord(name)) && /цех|хале|инструмент/i.test(oldGroup);
}

function locationLabelFromGroup(oldGroup) {
  const map = {
    "Хале  - инструменти": "Хале",
    "Хале - инструменти": "Хале",
    "Производствен цех - инструменти": "Производствен цех",
    "Фрезовъчен цех": "Фрезовъчен цех",
    Металхидрид: "Металхидрид",
    "3. Инструменти": "Общи инструменти",
  };
  return map[oldGroup] || oldGroup;
}

const PARENT_CATS = new Set([
  "01-piping-fluid",
  "02-fasteners",
  "03-electrical",
  "04-sensors-devices",
  "05-process",
  "06-tools-machines",
  "07-consumables",
  "08-misc",
  "08.02-misc",
]);

/** Reclassify by article name into a leaf type category. */
function categorizeItemName(name, fallbackCat) {
  const low = normalizeName(name).toLowerCase();

  // Fasteners
  if (/(^|\s)болт|(^|\s)винт|винкел/.test(low)) return "02.01-bolts-screws";
  if (/гайк/.test(low)) return "02.02-nuts";
  if (/шайб/.test(low)) return "02.03-washers";
  if (/крепеж|штифт|щифт|нинт|нит |шплент|шплинт|u-?болт|болт u/.test(low)) {
    return "02.04-other-fasteners";
  }

  // Piping / fluid
  if (/тръб/.test(low) && !/кабел/.test(low)) return "01.01-pipes";
  if (/фланц/.test(low)) return "01.04-flanges";
  if (
    /коляно|тройник|нипел|муфа|холенд|тапа|преход|щуцер|връзка|редукц|male |female |elbow|connector|swagelok|swa /.test(
      low,
    )
  ) {
    return "01.03-thread-fittings";
  }
  if (/кран|вентил|клапан|иглен|сферичн/.test(low)) return "01.05-valves";
  if (/актуатор|акутатор|задвижк|бобина/.test(low)) return "01.06-actuators";
  if (/маркуч|шлаух|гъвкав|hose/.test(low)) return "01.08-hoses";
  if (/армату/.test(low)) return "01.09-armatures";
  if (/\bpp\b|месинг|хром/.test(low) && /връз|фитинг|муфа|колян/.test(low)) {
    return "01.07-pp-brass-chrome";
  }

  // Electrical
  if (/кабел/.test(low) && /канал/.test(low)) return "03.04-channels";
  if (/^кабел|проводник|\bжила\b/.test(low)) return "03.01-cables";
  if (/клем|wago|терминал/.test(low)) return "03.02-terminals";
  if (/cable gland|накрайник|обувк|уплътнен/.test(low)) return "03.03-lugs-glands";
  if (/захранв|power supply|sdr-/.test(low)) return "03.05-power-supplies";
  if (/платк|pcb|baseunit|6es7/.test(low)) return "03.06-pcbs";
  if (
    /бутон|реле|прекъсвач|контактор|упс|usb|tp-link|модул|електрон|din шина|stop/.test(
      low,
    )
  ) {
    return "03.07-other-electronics";
  }

  // Sensors / devices
  if (/сензор|дебитомер|маномет|термомет|анализатор/.test(low)) {
    return "04.01-sensors";
  }
  if (/помп|филтър|колона|дозир/.test(low)) return "04.02-devices";

  // Process
  if (/демистър|очиск|гъба демист/.test(low)) return "05.02-scrubber";
  if (/металхидрид|мх /.test(low)) return "05.03-metal-hydride";
  if (/пречиств|антискалант|дейониз|аква ?филт|дисков филт/.test(low)) {
    return "05.04-water-treatment";
  }
  if (/съд|бутилк|буферен|контейнер|дъно за/.test(low)) return "05.05-vessels";
  if (/металн|листов|профил|\bгв\b|гумен лист|водно рязан|газово рязан|ламарина|плоча|капа |капи |лист неръжд|перфорир|плетена мрежа|материал за фитинг/.test(low)) {
    return "05.06-metal-parts";
  }
  if (/корпус/.test(low)) return "05.07-housings";
  if (/о-?пръстен|уплътнител|зеолит|мембран|лантан|никел|хипохлорид|изолирбанд/.test(low)) {
    return "07.01-consumables";
  }
  if (/нагревател|осветител|компютър/.test(low)) return "04.02-devices";
  if (/монтажен комплект|комплект за отнемане/.test(low)) return "02.04-other-fasteners";

  // Tools
  if (
    /отверт|клещи|пила|чук|чирак|макетен|стяга|ключ |ножиц|шублер|ролетк|трион|бормашин|шлайф/.test(
      low,
    )
  ) {
    return "06.01-hand-tools";
  }
  if (/машин/.test(low)) return "06.02-machines";

  // Consumables / services
  if (/консуматив|реактив|лепил|смазк|аерозол|лента|силикон|банка реактив/.test(low)) {
    return "07.01-consumables";
  }
  if (/услуг|рязан|заварк|транспорт|наем/.test(low)) return "08.01-services";

  // Keep a specific leaf fallback; map parent buckets to a default leaf
  if (fallbackCat === "03-electrical") return "03.07-other-electronics";
  if (fallbackCat === "02-fasteners") return "02.04-other-fasteners";
  if (fallbackCat === "01-piping-fluid") return "01.03-thread-fittings";
  if (fallbackCat === "06-tools-machines") return "06.01-hand-tools";
  if (fallbackCat === "05-process") return "05.06-metal-parts";
  if (fallbackCat && !PARENT_CATS.has(fallbackCat) && fallbackCat !== "08.02-misc") {
    return fallbackCat;
  }
  return "08.02-misc";
}

function catMeta(id) {
  const node = CAT_BY_ID.get(id);
  if (!node) return { id, name: id, code: "", parent_id: null };
  if (node.parent) {
    const parent = CAT_BY_ID.get(node.parent);
    return {
      id,
      name: node.name,
      code: node.code,
      parent_id: node.parent,
      parent_name: parent?.name,
    };
  }
  return { id, name: node.name, code: node.code, parent_id: null };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const grupi = loadCsv("GRUPI.csv");
  const defs = loadCsv("STOKI_DEF.csv");
  const stoki = loadCsv("STOKI.csv");

  const parentOf = new Map();
  const grupiActive = new Map();
  for (const g of grupi) {
    parentOf.set(g.GRUPA, g.PARENT_GR || "");
    grupiActive.set(g.GRUPA, String(g.IS_ACTIVE || "").toUpperCase() !== "N");
  }

  function pathOf(name) {
    const seen = new Set();
    const parts = [];
    let cur = name;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      parts.unshift(cur);
      cur = parentOf.get(cur) || "";
      if (parts.length > 25) break;
    }
    return parts;
  }

  // All group names that appear anywhere
  const groupNames = new Set([
    ...grupi.map((g) => g.GRUPA),
    ...defs.map((d) => d.GRUPA),
    ...stoki.map((s) => s.GRUPA),
  ]);
  groupNames.delete("");

  const groupMapping = [];
  const mapByOld = new Map();

  for (const g of [...groupNames].sort((a, b) => a.localeCompare(b, "bg"))) {
    const pathNames = pathOf(g);
    const parent = parentOf.get(g) || "";
    const newCat = categorizeByHeuristics(g, parent, pathNames);
    const vendor = vendorFromGroup(g, parent, pathNames);
    const tags = systemTagsForGroup(g, pathNames);
    const isVendorBucket =
      parent === "1. Фирми" || KNOWN_VENDORS.has(g) || pathNames.includes("1. Фирми");
    const isToolLocation = TOOL_LOCATION_GROUPS.has(g);
    const entry = {
      old_group: g,
      old_parent: parent || null,
      old_path: pathNames.join(" > "),
      new_category_id: newCat,
      new_category: catMeta(newCat),
      vendor_default: vendor,
      system_tags: tags,
      flags: {
        is_vendor_bucket: Boolean(isVendorBucket && g !== "1. Фирми"),
        is_tool_location: isToolLocation,
        is_structural_only: !defs.some((d) => d.GRUPA === g),
        was_numbered: /^\d/.test(g),
      },
      decision_notes: [],
    };
    if (entry.flags.is_vendor_bucket) {
      entry.decision_notes.push(
        "Vendor A: supplier moved to item.supplier; category from article type",
      );
    }
    if (entry.flags.is_tool_location) {
      entry.decision_notes.push(
        "Tools A: location preserved on stock rows; articles merge by normalized name",
      );
    }
    if (tags.length) {
      entry.decision_notes.push(
        `System A: tags [${tags.join(", ")}] — not used as sole folder`,
      );
    }
    groupMapping.push(entry);
    mapByOld.set(g, entry);
  }

  // Stock rows: key by group+name
  const stockRows = [];
  for (const s of stoki) {
    const qty = parseFloat(s.KOLICH);
    if (!Number.isFinite(qty) || qty === 0) continue;
    stockRows.push({
      old_group: s.GRUPA,
      name: s.STOKA,
      qty,
      sklad: s.SKLAD || "",
      soft: softKey(s.STOKA),
    });
  }

  // Build articles from defs
  const articlesRaw = [];
  for (const d of defs) {
    const oldGroup = d.GRUPA || "";
    const gMap = mapByOld.get(oldGroup) || {
      new_category_id: "08.02-misc",
      vendor_default: null,
      system_tags: [],
      flags: {},
    };
    const nameNorm = normalizeName(d.STOKA);
    const nameChanged = nameNorm !== String(d.STOKA || "").trim();
    let catId = gMap.new_category_id;
    // Always refine parent/misc/vendor buckets by article name; keep specific leaves
    if (
      gMap.flags?.is_vendor_bucket ||
      PARENT_CATS.has(catId) ||
      catId === "08.02-misc"
    ) {
      catId = categorizeItemName(nameNorm, catId);
    } else {
      // Still allow name hint to override only when leaf is clearly wrong for tools
      const byName = categorizeItemName(nameNorm, catId);
      if (byName.startsWith("06.01") && looksLikeTool(d.STOKA, oldGroup)) {
        catId = byName;
      }
    }
    // Tools detected in MH etc.
    const isTool = looksLikeTool(d.STOKA, oldGroup);
    if (isTool) catId = "06.01-hand-tools";

    const tags = [...(gMap.system_tags || [])];
    // If tool pulled out of MH process group, keep MH tag only if not clearly a tool-only location... 
    // Tools A: tools get location, not process category; still may have been stored at MH site
    if (isTool && tags.includes("metal-hydride") && TOOL_FIRST_WORDS.has(firstWord(d.STOKA))) {
      // drop process tag for pure hand tools
      const i = tags.indexOf("metal-hydride");
      if (i >= 0) tags.splice(i, 1);
    }

    articlesRaw.push({
      source_code: d.CODE || "",
      old_group: oldGroup,
      old_name: d.STOKA,
      name: nameNorm,
      name_changed: nameChanged,
      unit_hint: d.RAZFAS1 || "",
      barcode: d.BARCODE || "",
      note: d.NOTE || "",
      new_category_id: catId,
      supplier: gMap.vendor_default || null,
      system_tags: tags,
      soft_key: softKey(d.STOKA),
      is_tool: isTool,
      cena_kup: d.CENA_KUP || "",
    });
  }

  // Merge tools with same soft_key into one article; collect locations from stock
  const toolGroups = new Map(); // soft_key -> articles
  const nonTools = [];
  for (const a of articlesRaw) {
    if (a.is_tool) {
      if (!toolGroups.has(a.soft_key)) toolGroups.set(a.soft_key, []);
      toolGroups.get(a.soft_key).push(a);
    } else {
      nonTools.push(a);
    }
  }

  const mergedTools = [];
  const toolMergeReport = [];
  for (const [sk, list] of toolGroups) {
    // Prefer Title-case name / most common display
    const names = list.map((x) => x.name);
    const name = names.sort((a, b) => b.length - a.length)[0];
    const suppliers = [...new Set(list.map((x) => x.supplier).filter(Boolean))];
    const oldGroups = [...new Set(list.map((x) => x.old_group))];
    const sourceCodes = list.map((x) => x.source_code).filter(Boolean);

    // Stock by location from matching stock rows
    const locQty = new Map();
    for (const sr of stockRows) {
      if (sr.soft !== sk) continue;
      const loc = locationLabelFromGroup(sr.old_group);
      locQty.set(loc, (locQty.get(loc) || 0) + sr.qty);
    }
    // Also attribute def-only groups with no stock using group as location if tool-location
    const stock_by_location = [...locQty.entries()].map(([location, qty]) => ({
      location,
      qty: roundQty(qty),
    }));

    const merged = {
      id: `tool:${sk}`,
      name,
      old_names: [...new Set(list.map((x) => x.old_name))],
      old_groups: oldGroups,
      source_codes: sourceCodes,
      new_category_id: "06.01-hand-tools",
      supplier: suppliers[0] || null,
      system_tags: [],
      is_tool: true,
      merged_from_count: list.length,
      stock_by_location,
      name_changed: list.some((x) => x.name_changed),
      soft_key: sk,
    };
    mergedTools.push(merged);
    if (list.length > 1 || stock_by_location.length > 1) {
      toolMergeReport.push({
        name,
        soft_key: sk,
        merged_articles: list.length,
        old_groups: oldGroups,
        stock_by_location,
        example:
          list.length > 1
            ? `Merged ${list.length} catalog rows → 1 SKU with per-location qty`
            : "Single catalog row; location from stock",
      });
    }
  }

  // Soft-duplicate non-tools (same soft key, different display) — flag, don't auto-merge non-tools except exact soft within same final category
  const nonToolBySoft = new Map();
  for (const a of nonTools) {
    if (!nonToolBySoft.has(a.soft_key)) nonToolBySoft.set(a.soft_key, []);
    nonToolBySoft.get(a.soft_key).push(a);
  }
  const softDupNonTools = [];
  const finalNonTools = [];
  for (const [sk, list] of nonToolBySoft) {
    if (list.length === 1) {
      finalNonTools.push(finalizeArticle(list[0], stockRows));
      continue;
    }
    // Auto-merge if only casing/punctuation differences (same soft key)
    const names = [...new Set(list.map((x) => x.name))];
    const preferred = list.slice().sort((a, b) => b.name.length - a.name.length)[0];
    const stock_by_location = aggregateStock(sk, stockRows);
    const merged = {
      id: `item:${sk}`,
      name: preferred.name,
      old_names: [...new Set(list.map((x) => x.old_name))],
      old_groups: [...new Set(list.map((x) => x.old_group))],
      source_codes: list.map((x) => x.source_code).filter(Boolean),
      new_category_id: preferred.new_category_id,
      supplier: list.map((x) => x.supplier).find(Boolean) || null,
      system_tags: [...new Set(list.flatMap((x) => x.system_tags))],
      is_tool: false,
      merged_from_count: list.length,
      stock_by_location,
      name_changed: list.some((x) => x.name_changed) || names.length > 1,
      soft_key: sk,
      soft_merge: true,
    };
    // If categories disagree, keep separate and only flag
    const cats = new Set(list.map((x) => x.new_category_id));
    if (cats.size > 1) {
      softDupNonTools.push({
        soft_key: sk,
        names: list.map((x) => x.old_name),
        categories: [...cats],
        groups: list.map((x) => x.old_group),
        action: "flagged_not_merged_category_conflict",
      });
      for (const a of list) finalNonTools.push(finalizeArticle(a, stockRows));
    } else {
      finalNonTools.push(merged);
      softDupNonTools.push({
        soft_key: sk,
        names: list.map((x) => x.old_name),
        categories: [...cats],
        groups: [...new Set(list.map((x) => x.old_group))],
        action: "merged_soft_duplicate",
        canonical_name: preferred.name,
      });
    }
  }

  const allArticles = [
    ...finalNonTools,
    ...mergedTools.map((t) => ({
      ...t,
      new_category: catMeta(t.new_category_id),
    })),
  ];
  for (const a of finalNonTools) {
    a.new_category = catMeta(a.new_category_id);
  }

  // Counts by new category
  const byCat = {};
  for (const a of allArticles) {
    byCat[a.new_category_id] = (byCat[a.new_category_id] || 0) + 1;
  }

  const discussionExamples = buildDiscussionExamples(
    mergedTools,
    softDupNonTools,
    allArticles,
    groupMapping,
  );

  const output = {
    meta: {
      generated_at: new Date().toISOString(),
      decisions: {
        tools: "A — one SKU, stock per location",
        vendors: "A — type category; supplier field",
        systems: "A — flatten to type; system tags for BOM",
      },
      source: {
        grupi: grupi.length,
        stoki_def: defs.length,
        stoki_rows_qty_nonzero: stockRows.length,
      },
      counts: {
        old_groups: groupMapping.length,
        articles_before: defs.length,
        articles_after: allArticles.length,
        tools_merged_groups: toolMergeReport.length,
        soft_dup_actions: softDupNonTools.length,
        articles_removed_by_merge: defs.length - allArticles.length,
      },
    },
    taxonomy: TAXONOMY,
    group_mapping: groupMapping,
    articles_by_category_counts: Object.entries(byCat)
      .map(([id, count]) => ({ ...catMeta(id), count }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    tool_merges: toolMergeReport.sort((a, b) => a.name.localeCompare(b.name, "bg")),
    soft_duplicate_actions: softDupNonTools,
    discussion_examples_preserved: discussionExamples,
    articles: allArticles.sort((a, b) =>
      `${a.new_category_id}|${a.name}`.localeCompare(
        `${b.new_category_id}|${b.name}`,
        "bg",
      ),
    ),
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), "utf8");
  fs.writeFileSync(OUT_REPORT, buildReport(output), "utf8");

  console.log("Wrote", OUT_JSON);
  console.log("Wrote", OUT_REPORT);
  console.log(
    "Articles",
    defs.length,
    "→",
    allArticles.length,
    "(merged",
    defs.length - allArticles.length,
    ")",
  );
  console.log("Groups mapped:", groupMapping.length);
}

function roundQty(q) {
  return Math.round(q * 1000) / 1000;
}

function aggregateStock(sk, stockRows) {
  const locQty = new Map();
  for (const sr of stockRows) {
    if (sr.soft !== sk) continue;
    const loc = locationLabelFromGroup(sr.old_group);
    locQty.set(loc, (locQty.get(loc) || 0) + sr.qty);
  }
  return [...locQty.entries()].map(([location, qty]) => ({
    location,
    qty: roundQty(qty),
  }));
}

function finalizeArticle(a, stockRows) {
  return {
    id: `item:${a.soft_key}:${a.old_group}`,
    name: a.name,
    old_names: [a.old_name],
    old_groups: [a.old_group],
    source_codes: a.source_code ? [a.source_code] : [],
    new_category_id: a.new_category_id,
    supplier: a.supplier,
    system_tags: a.system_tags,
    is_tool: false,
    merged_from_count: 1,
    stock_by_location: aggregateStock(a.soft_key, stockRows),
    name_changed: a.name_changed,
    soft_key: a.soft_key,
  };
}

function buildDiscussionExamples(mergedTools, softDups, articles, groupMapping) {
  // Preserve the concrete examples from the planning discussion
  const findTool = (substr) =>
    mergedTools.find((t) => t.name.toLowerCase().includes(substr.toLowerCase()));

  const klešti = findTool("клещи обикновени");
  const chuk = findTool("чук гумен");
  const pila = findTool("пила други") || findTool("пила");

  const psu = articles.find((a) =>
    /захранване за din шина sdr-120-24/i.test(a.name),
  );
  const firmChildren = groupMapping.filter((g) => g.flags.is_vendor_bucket).length;

  return {
    tools_option_A: {
      description:
        "One SKU with qty per location (examples from discussion)",
      examples: [
        klešti && {
          article: klešti.name,
          before:
            "Separate rows under Металхидрид (qty 2) and Фрезовъчен цех (qty 1)",
          after: {
            category: "06.01 Ръчни инструменти",
            stock_by_location: klešti.stock_by_location,
          },
        },
        chuk && {
          article: chuk.name,
          before:
            "Separate rows under Производствен цех (2) and Хале (3)",
          after: {
            category: "06.01 Ръчни инструменти",
            stock_by_location: chuk.stock_by_location,
          },
        },
        pila && {
          article: pila.name,
          before: "Appeared under Металхидрид / Производствен / Фрезовъчен",
          after: {
            category: "06.01 Ръчни инструменти",
            stock_by_location: pila.stock_by_location,
            merged_from_count: pila.merged_from_count,
          },
        },
      ].filter(Boolean),
    },
    vendors_option_A: {
      description:
        "Type category is home; supplier is a field only (examples from discussion)",
      examples: [
        {
          before: "Pipe under vendor folder Крисметал",
          after_rule:
            "Article → 01.01 Тръби (or fitting subtype by name); supplier = Крисметал",
        },
        {
          before: "Power supply under Унител and/or Захранвания",
          after_rule:
            "Article → 03.05 Захранвания; supplier = Унител when from firm folder",
          resolved: psu
            ? {
                name: psu.name,
                category: psu.new_category_id,
                supplier: psu.supplier,
                old_groups: psu.old_groups,
              }
            : null,
        },
        {
          before: "`1. Фирми` had ~58 vendor child groups",
          after: `${firmChildren} groups flagged is_vendor_bucket; items reclassified by article type`,
        },
      ],
    },
    systems_option_A: {
      description:
        "Flatten into type categories; electrolyzer / очиска / gas / MH as tags",
      examples: [
        {
          before: "1.1.2 Крепежи (Електролизьор) as folder for bolts",
          after:
            "Articles → 02.xx Крепежи; system_tags includes electrolyzer",
        },
        {
          before: "Газ анализ - Фитинги / Крепежи as folders",
          after:
            "Articles → 01.03 thread fittings / 02.04 fasteners; tag gas-analyzer",
        },
        {
          before: "Металхидрид mixed MH parts and hand tools",
          after:
            "Parts → 05.03 with tag metal-hydride; hand tools → 06.01 with location Металхидрид",
        },
      ],
    },
  };
}

function buildReport(output) {
  const m = output.meta;
  const lines = [];
  lines.push("# Warehouse reorganisation — change report");
  lines.push("");
  lines.push(`Generated: ${m.generated_at}`);
  lines.push("");
  lines.push("## Decisions locked");
  lines.push("");
  lines.push(`1. **Tools — A:** ${m.decisions.tools}`);
  lines.push(`2. **Vendors — A:** ${m.decisions.vendors}`);
  lines.push(`3. **Systems — A:** ${m.decisions.systems}`);
  lines.push("");
  lines.push("## Summary counts");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Old groups mapped | ${m.counts.old_groups} |`);
  lines.push(`| Articles before (STOKI_DEF) | ${m.counts.articles_before} |`);
  lines.push(`| Articles after | ${m.counts.articles_after} |`);
  lines.push(`| Rows removed by merge (no data loss of qty) | ${m.counts.articles_removed_by_merge} |`);
  lines.push(`| Tool merge groups reported | ${m.counts.tools_merged_groups} |`);
  lines.push(`| Soft-duplicate actions | ${m.counts.soft_dup_actions} |`);
  lines.push("");
  lines.push("## Target taxonomy");
  lines.push("");
  for (const root of output.taxonomy) {
    lines.push(`### ${root.code} ${root.name} (${root.name_en})`);
    for (const ch of root.children) {
      const cnt =
        output.articles_by_category_counts.find((c) => c.id === ch.id)?.count ?? 0;
      lines.push(`- \`${ch.code}\` ${ch.name} — **${cnt}** articles`);
    }
    lines.push("");
  }

  lines.push("## Discussion examples (preserved)");
  lines.push("");
  lines.push(
    "These are the concrete examples from the planning discussion, carried into the reorganised data.",
  );
  lines.push("");
  lines.push("### 1. Tools — Option A");
  lines.push("");
  lines.push(output.discussion_examples_preserved.tools_option_A.description);
  lines.push("");
  for (const ex of output.discussion_examples_preserved.tools_option_A.examples) {
    lines.push(`#### ${ex.article}`);
    lines.push(`- **Before:** ${ex.before}`);
    lines.push(`- **After category:** ${ex.after.category}`);
    lines.push(`- **Stock by location:**`);
    for (const row of ex.after.stock_by_location || []) {
      lines.push(`  - ${row.location}: ${row.qty}`);
    }
    if (ex.after.merged_from_count) {
      lines.push(`- **Merged from:** ${ex.after.merged_from_count} catalog rows`);
    }
    lines.push("");
  }

  lines.push("### 2. Vendors — Option A");
  lines.push("");
  lines.push(output.discussion_examples_preserved.vendors_option_A.description);
  lines.push("");
  for (const ex of output.discussion_examples_preserved.vendors_option_A.examples) {
    if (ex.before) lines.push(`- **Before:** ${ex.before}`);
    if (ex.after_rule) lines.push(`  - **After rule:** ${ex.after_rule}`);
    if (ex.after) lines.push(`  - **After:** ${ex.after}`);
    if (ex.resolved) {
      lines.push(`  - **Resolved article:** ${ex.resolved.name}`);
      lines.push(`    - category: \`${ex.resolved.category}\``);
      lines.push(`    - supplier: ${ex.resolved.supplier ?? "(none)"}`);
      lines.push(`    - old groups: ${ex.resolved.old_groups.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("### 3. Systems — Option A");
  lines.push("");
  lines.push(output.discussion_examples_preserved.systems_option_A.description);
  lines.push("");
  for (const ex of output.discussion_examples_preserved.systems_option_A.examples) {
    lines.push(`- **Before:** ${ex.before}`);
    lines.push(`  - **After:** ${ex.after}`);
  }
  lines.push("");

  lines.push("## Naming normalisation rules applied");
  lines.push("");
  lines.push("- Unify inch/quotes to ASCII `\"` (smart quotes, backticks, doubled quotes)");
  lines.push("- Collapse repeated whitespace");
  lines.push("- Trim trailing `-` (e.g. PCB names `GI1PWR02-` → `GI1PWR02`)");
  lines.push("- Title-case the first Bulgarian type word when the name was all-lowercase");
  lines.push("- Soft-key merge for identical letters ignoring punctuation/case");
  lines.push("");

  lines.push("## Sample tool merges");
  lines.push("");
  const sampleTools = output.tool_merges.slice(0, 25);
  for (const t of sampleTools) {
    lines.push(`- **${t.name}** ← groups: ${t.old_groups.join(" · ")}`);
    for (const s of t.stock_by_location) {
      lines.push(`  - ${s.location}: ${s.qty}`);
    }
  }
  if (output.tool_merges.length > 25) {
    lines.push(`- … and ${output.tool_merges.length - 25} more (see JSON \`tool_merges\`)`);
  }
  lines.push("");

  lines.push("## Group mapping (old → new)");
  lines.push("");
  lines.push("| Old group | New category | Vendor default | System tags |");
  lines.push("|-----------|--------------|----------------|-------------|");
  for (const g of output.group_mapping) {
    const cat = `${g.new_category.code} ${g.new_category.name}`;
    const vend = g.vendor_default ?? "";
    const tags = (g.system_tags || []).join(", ");
    lines.push(
      `| ${escapePipe(g.old_group)} | ${escapePipe(cat)} | ${escapePipe(vend)} | ${escapePipe(tags)} |`,
    );
  }
  lines.push("");
  lines.push("## Remaining in `08.02 Разни` (manual review)");
  lines.push("");
  const misc = output.articles.filter((a) => a.new_category_id === "08.02-misc");
  lines.push(
    `${misc.length} articles still land in misc after name heuristics — kept here rather than guess wrong. Sample:`,
  );
  lines.push("");
  for (const a of misc.slice(0, 40)) {
    lines.push(
      `- ${escapePipe(a.name) || "(empty name)"} ← _${escapePipe(a.old_groups.join(", "))}_` +
        (a.supplier ? ` · supplier: ${escapePipe(a.supplier)}` : ""),
    );
  }
  if (misc.length > 40) {
    lines.push(`- … and ${misc.length - 40} more (filter JSON \`articles\` where \`new_category_id\` = \`08.02-misc\`)`);
  }
  lines.push("");

  lines.push("## No data loss guarantee");
  lines.push("");
  lines.push(
    "- Every STOKI_DEF article is represented in `articles` (possibly merged).",
  );
  lines.push(
    "- Merges only combine soft-identical names; quantities are summed **per location**.",
  );
  lines.push(
    "- Old group path, old names, and source codes are retained on each article.",
  );
  lines.push(
    "- Supplier and system tags are additive metadata — nothing discarded.",
  );
  lines.push("");
  lines.push("## Output files");
  lines.push("");
  lines.push("- `templates/warehouse-data/WH_data_reorganised_updated.json` — full mapping + articles");
  lines.push("- `templates/warehouse-data/WH_reorganisation_change_report.md` — this report");
  lines.push("");
  lines.push("## Next steps (not done in this pass)");
  lines.push("");
  lines.push("1. Review mapping edge cases (items still in `08.02 Разни`)");
  lines.push("2. Additive DB fields if needed: `system_tags`, richer location labels for tool sites");
  lines.push("3. Import path: apply new groups + supplier + tags without deleting legacy source keys");
  lines.push("");
  return lines.join("\n");
}

function escapePipe(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

main();
