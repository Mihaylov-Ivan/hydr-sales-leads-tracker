/**
 * Build warehouse reorganisation mapping + draft catalog from MoneyWorks CSVs.
 * Decisions locked: Tools A, Vendor A, System A.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve("templates/warehouse-data");
const CORE = path.join(ROOT, "MoneyWorks_Core_Warehouse_CSV/tables");

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  let row = [];
  let field = "";
  let inQuotes = false;
  while (i < len) {
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
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter((r) => r.some((x) => x !== "")).map((r) => {
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = r[idx] ?? "";
    });
    return o;
  });
}

function readTable(name) {
  return parseCsv(fs.readFileSync(path.join(CORE, name), "utf8"));
}

const TAXONOMY = [
  {
    id: "01-piping-fluid",
    name: "Piping & fluid",
    name_bg: "Тръбни връзки и флуиди",
    children: [
      { id: "01.01-pipes", name: "Pipes", name_bg: "Тръби" },
      { id: "01.02-weld-fittings", name: "Weld fittings", name_bg: "Фитинги за заваряване" },
      { id: "01.03-thread-fittings", name: "Thread fittings", name_bg: "Фитинги на резба" },
      { id: "01.04-flanges", name: "Flanges", name_bg: "Фланци" },
      { id: "01.05-valves", name: "Valves & cocks", name_bg: "Кранове, вентили и клапани" },
      { id: "01.06-actuators", name: "Actuators", name_bg: "Актуатори" },
      { id: "01.07-pp-brass-chrome", name: "PP / brass / chrome", name_bg: "PP, месинг, хром връзки" },
      { id: "01.08-hoses", name: "Hoses & flex", name_bg: "Маркучи и гъвкави връзки" },
      { id: "01.09-armatures", name: "Armatures", name_bg: "Арматури" },
    ],
  },
  {
    id: "02-fasteners",
    name: "Fasteners",
    name_bg: "Крепежи",
    children: [
      { id: "02.01-bolts-screws", name: "Bolts & screws", name_bg: "Болтове и винтове" },
      { id: "02.02-nuts", name: "Nuts", name_bg: "Гайки" },
      { id: "02.03-washers", name: "Washers", name_bg: "Шайби" },
      { id: "02.04-other-fasteners", name: "Other fasteners", name_bg: "Други крепежи" },
    ],
  },
  {
    id: "03-electrical",
    name: "Electrical",
    name_bg: "Електроника и кабели",
    children: [
      { id: "03.01-cables", name: "Cables", name_bg: "Кабели" },
      { id: "03.02-terminals", name: "Terminals", name_bg: "Клеми" },
      { id: "03.03-glands-lugs", name: "Glands & lugs", name_bg: "Кабелни накрайници и обувки" },
      { id: "03.04-channels", name: "Cable channels", name_bg: "Кабелни канали" },
      { id: "03.05-power-supplies", name: "Power supplies", name_bg: "Захранвания" },
      { id: "03.06-pcbs", name: "PCBs", name_bg: "Платки" },
      { id: "03.07-other-electronics", name: "Other electronics", name_bg: "Друга електроника" },
    ],
  },
  {
    id: "04-sensors-devices",
    name: "Sensors & devices",
    name_bg: "Сензори и устройства",
    children: [
      { id: "04.01-sensors", name: "Sensors", name_bg: "Сензори" },
      { id: "04.02-devices", name: "Devices", name_bg: "Устройства" },
      { id: "04.03-gas-analyzer", name: "Gas analyzer panel parts", name_bg: "Части за табло газ анализатор" },
    ],
  },
  {
    id: "05-process",
    name: "Process assemblies",
    name_bg: "Процесни възли и части",
    children: [
      { id: "05.01-electrolyzer", name: "Electrolyzer parts", name_bg: "Части електролизьор" },
      { id: "05.02-scrubber", name: "Scrubber / очиска", name_bg: "Части очиска" },
      { id: "05.03-metal-hydride", name: "Metal hydride", name_bg: "Металхидрид" },
      { id: "05.04-water-treatment", name: "Water treatment", name_bg: "Пречистване на вода" },
      { id: "05.05-vessels", name: "Vessels", name_bg: "Съдове" },
      { id: "05.06-metal-parts", name: "Metal parts", name_bg: "Метални елементи" },
      { id: "05.07-housings", name: "Housings", name_bg: "Корпуси" },
    ],
  },
  {
    id: "06-tools-machines",
    name: "Tools & machines",
    name_bg: "Инструменти и машини",
    children: [
      { id: "06.01-hand-tools", name: "Hand tools", name_bg: "Ръчни инструменти" },
      { id: "06.02-machines", name: "Machines", name_bg: "Машини" },
    ],
  },
  {
    id: "07-consumables",
    name: "Consumables",
    name_bg: "Консумативи",
    children: [{ id: "07.01-consumables", name: "Consumables", name_bg: "Консумативи" }],
  },
  {
    id: "08-misc",
    name: "Services & misc",
    name_bg: "Услуги и разни",
    children: [
      { id: "08.01-services", name: "Services", name_bg: "Услуги" },
      { id: "08.02-misc", name: "Misc", name_bg: "Разни" },
      { id: "08.03-inactive", name: "Inactive / archive", name_bg: "Неактивни" },
    ],
  },
];

/** Old GRUPI name → mapping rule */
const GROUP_MAP = {
  // Piping
  "2. Тръбни връзки": { category_id: "01-piping-fluid", action: "folder_only" },
  "2.1. Тръби": { category_id: "01.01-pipes" },
  "2.2. Фитинги за заваряване": { category_id: "01.02-weld-fittings" },
  "2.3. Фитинги на резба": { category_id: "01.03-thread-fittings", action: "folder_only" },
  "2.4. Фланци": { category_id: "01.04-flanges" },
  "2.5. Кранове": { category_id: "01.05-valves", action: "folder_only" },
  "2.5.1. Кранове на фланци": { category_id: "01.05-valves" },
  "2.5.2. Кранове на заварка": { category_id: "01.05-valves" },
  "2.5.3. Кранове на резба": { category_id: "01.05-valves" },
  "2.5.4. Вентили": { category_id: "01.05-valves" },
  "2.5.5. Клапани": { category_id: "01.05-valves" },
  "2.5.6. Акутатори": { category_id: "01.06-actuators" },
  "2.6. Арматури": { category_id: "01.09-armatures" },
  "2.7. PP, Месинг, Хром връзки": { category_id: "01.07-pp-brass-chrome" },
  "2.8. Маркучи": { category_id: "01.08-hoses" },
  "Преходи на резба": { category_id: "01.03-thread-fittings" },
  "М/Ж резба": { category_id: "01.03-thread-fittings" },
  "Фитинги - Щуцер на резба": { category_id: "01.03-thread-fittings" },
  "Газ анализ - Фитинги": {
    category_id: "01.03-thread-fittings",
    system_tags: ["gas-analyzer"],
  },

  // Fasteners – size groups collapse
  "4. Крепежи": { category_id: "02-fasteners", action: "folder_only" },
  М3: { category_id: "02.01-bolts-screws", fastener_size: "M3" },
  М5: { category_id: "02.01-bolts-screws", fastener_size: "M5" },
  М6: { category_id: "02.01-bolts-screws", fastener_size: "M6" },
  М8: { category_id: "02.01-bolts-screws", fastener_size: "M8" },
  М10: { category_id: "02.01-bolts-screws", fastener_size: "M10" },
  М12: { category_id: "02.01-bolts-screws", fastener_size: "M12" },
  М16: { category_id: "02.01-bolts-screws", fastener_size: "M16" },
  "Други (Крепежи)": { category_id: "02.04-other-fasteners" },
  "Газ анализ - Крепежи": {
    category_id: "02.04-other-fasteners",
    system_tags: ["gas-analyzer"],
  },
  "1.1.2. Крепежи (Електролизьор)": {
    category_id: "02.04-other-fasteners",
    system_tags: ["electrolyzer"],
  },

  // Electrical
  "6. Електроника": {
    category_id: "03.07-other-electronics",
    action: "folder_only",
  },
  "7. Кабели": { category_id: "03.01-cables" },
  Клеми: { category_id: "03.02-terminals" },
  "Кабелни накрайници, обувки": { category_id: "03.03-glands-lugs" },
  "Кабелни Канали": { category_id: "03.04-channels" },
  Захранвания: { category_id: "03.05-power-supplies" },
  "Платки - Green Innovation": {
    category_id: "03.06-pcbs",
    system_tags: ["green-innovation"],
  },
  "Други (Електроника)": { category_id: "03.07-other-electronics" },
  "свързващи кабели с конектор": { category_id: "03.01-cables" },
  "2) Материали за платки": { category_id: "03.06-pcbs", action: "folder_only" },

  // Sensors / devices
  Сензори: { category_id: "04.01-sensors" },
  "5. Устройства": { category_id: "04.02-devices" },
  "8. Табло газ анализатор": {
    category_id: "04.03-gas-analyzer",
    system_tags: ["gas-analyzer"],
    action: "folder_only",
  },

  // Process / system → type + tags (Decision 3A: flatten type where possible;
  // keep true custom parts under process leaf)
  "1.1 Електролизьор": {
    category_id: "05.01-electrolyzer",
    system_tags: ["electrolyzer"],
    action: "folder_only",
  },
  "1.1.1. Части (Електролизьор)": {
    category_id: "05.01-electrolyzer",
    system_tags: ["electrolyzer"],
  },
  "1.1.3. Други (Електролизьор)": {
    category_id: "05.01-electrolyzer",
    system_tags: ["electrolyzer"],
  },
  "1.2. Очиска": {
    category_id: "05.02-scrubber",
    system_tags: ["scrubber"],
    action: "folder_only",
  },
  "1.2.1. Части (Очиска)": {
    category_id: "05.02-scrubber",
    system_tags: ["scrubber"],
  },
  "1.2.2 Съдове (Очиска)": {
    category_id: "05.05-vessels",
    system_tags: ["scrubber"],
  },
  "1.3. Металхидрид": {
    category_id: "05.03-metal-hydride",
    system_tags: ["metal-hydride"],
  },
  Металхидрид: {
    category_id: "05.03-metal-hydride",
    system_tags: ["metal-hydride"],
    // tools inside will be reclassified by name heuristics
  },
  "1. Пречистване на вода": {
    category_id: "05.04-water-treatment",
    system_tags: ["water-treatment"],
  },
  "1. Съдове": { category_id: "05.05-vessels", action: "folder_only" },
  "4. Съдове": { category_id: "05.05-vessels" },
  "3. Метални Елементи": { category_id: "05.06-metal-parts" },
  "2. Корпуси": { category_id: "05.07-housings" },

  // Tools / machines – Decision 1A
  "3. Инструменти": { category_id: "06.01-hand-tools" },
  "Хале  - инструменти": {
    category_id: "06.01-hand-tools",
    stock_location_hint: "Хале",
  },
  "Производствен цех - инструменти": {
    category_id: "06.01-hand-tools",
    stock_location_hint: "Производствен цех",
  },
  Фрезовъчен: { category_id: "06.01-hand-tools", stock_location_hint: "Фрезовъчен цех" },
  "Фрезовъчен цех": {
    category_id: "06.01-hand-tools",
    stock_location_hint: "Фрезовъчен цех",
  },
  Машини: { category_id: "06.02-machines" },

  // Consumables
  "2. Консумативи": { category_id: "07.01-consumables" },
  "3. Консумативи": { category_id: "07.01-consumables" },

  // Misc / services / junk
  "4. Услуги": { category_id: "08.01-services" },
  "0. Разни": { category_id: "08.02-misc" },
  "0. За фактури": { category_id: "08.02-misc" },
  "9. Други": { category_id: "08.02-misc" },
  Неактивни: { category_id: "08.03-inactive", action: "folder_only" },
  "500": { category_id: "08.03-inactive", action: "archive_empty" },
  "951038": { category_id: "08.03-inactive", action: "archive_empty" },
  ЛД: { category_id: "08.03-inactive", action: "archive_empty" },

  // Vendor parent – Decision 2A
  "1. Фирми": { category_id: null, action: "vendor_parent", note: "Children are suppliers, not categories" },
  "1) Грийн Иновейшън АД": {
    category_id: "03.06-pcbs",
    supplier_default: "Грийн Иновейшън АД",
    system_tags: ["green-innovation"],
  },

  Материали: { category_id: "08.02-misc", action: "folder_only" },

  // Vendor subfolders (type under supplier parent)
  Тръби: {
    category_id: "01.01-pipes",
    action: "vendor_subgroup",
    supplier_from_parent: true,
  },
  "Заваръчни връзки": {
    category_id: "01.02-weld-fittings",
    action: "vendor_subgroup",
    supplier_from_parent: true,
  },
  "Фланцови връзки": {
    category_id: "01.04-flanges",
    action: "vendor_subgroup",
    supplier_from_parent: true,
  },
  Кранове: {
    category_id: "01.05-valves",
    action: "vendor_subgroup",
    supplier_from_parent: true,
  },
};

// Thread-fitting subgroups often under 2.3
const THREAD_SUBGROUP_HINTS = [
  "коляно",
  "тройник",
  "нипел",
  "муфа",
  "тапа",
  "холендър",
  "преход",
  "щуцер",
  "резба",
];

const TOOL_NAME_RE =
  /^(пила|клещи|отвертки|отвертка|чук|чирак|нож|макетен|стяга|ключ|ножици|шпакла|файл|бормашина|ъглошлайф)/i;

function normalizeName(name) {
  let s = String(name || "").trim();
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"'); // smart "
  s = s.replace(/[\u2018\u2019\u0060]/g, "'"); // smart ' and `
  s = s.replace(/``+/g, '"');
  s = s.replace(/\s+/g, " ");
  s = s.replace(/-\s*$/, "");
  return s;
}

function softKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїґ]/gi, "");
}

function titleFirstWord(name) {
  const s = normalizeName(name);
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function classifyFastenerLeaf(name, baseCategory) {
  const n = name.toLowerCase();
  if (/гайк/.test(n)) return "02.02-nuts";
  if (/шайб/.test(n)) return "02.03-washers";
  if (/болт|винт|винтче/.test(n)) return "02.01-bolts-screws";
  if (baseCategory?.startsWith("02.")) return baseCategory;
  return "02.04-other-fasteners";
}

function isVendorParent(parent) {
  return parent === "1. Фирми";
}

function inferCategoryFromName(name, fallback) {
  const n = name.toLowerCase();
  if (TOOL_NAME_RE.test(n)) return "06.01-hand-tools";
  if (/^кабел|^проводник|^свързващ/.test(n)) return "03.01-cables";
  if (/^платка|^pcb\b/.test(n)) return "03.06-pcbs";
  if (/тръба|^профилн|^пп\s/.test(n)) return "01.01-pipes";
  if (/^лист |^плоча |^ламарина/.test(n)) return "05.06-metal-parts";
  if (/^кран|^вентил|^клапан|^магнетвентил|^иглен|^сферичен кран/.test(n))
    return "01.05-valves";
  if (/^фланец|^уплътнение cf|^уплътнение dn/.test(n)) return "01.04-flanges";
  if (/^коляно|^тройник|^нипел|^муфа|^тапа|^холендър|^преход|^щуцер|^male |^female |^union |^bulkhead/.test(n))
    return "01.03-thread-fittings";
  if (/^болт|^винт|^гайка|^шайба|^clamp|^cable gland/.test(n)) return classifyFastenerLeaf(name);
  if (/^сензор/.test(n)) return "04.01-sensors";
  if (/^дебитомер|^помпа|^вентилатор/.test(n)) return "04.02-devices";
  if (/^захранване/.test(n)) return "03.05-power-supplies";
  if (/^клема/.test(n)) return "03.02-terminals";
  if (/^кабелен канал/.test(n)) return "03.04-channels";
  if (/^кабелн(и|а) (накрайник|обувк)/.test(n)) return "03.03-glands-lugs";
  if (/^маркуч|^гъвкав/.test(n)) return "01.08-hoses";
  if (/^съд |^резервоар|^демистър/.test(n)) return "05.05-vessels";
  // Never leave vendor leftovers on a parent folder id
  if (fallback === "03-electrical" || fallback === "01-piping-fluid" || fallback === "02-fasteners") {
    return "08.02-misc";
  }
  return fallback;
}

function main() {
  const grupi = readTable("GRUPI.csv");
  const defs = readTable("STOKI_DEF.csv").filter(
    (r) => String(r.IS_ACTIVE || "Y").toUpperCase() !== "N",
  );
  const stoki = readTable("STOKI.csv");

  const groupsByName = new Map();
  for (const g of grupi) {
    groupsByName.set(g.GRUPA, g);
  }

  // Collect vendor names (children of 1. Фирми)
  const vendorNames = new Set();
  for (const g of grupi) {
    if (isVendorParent(g.PARENT_GR)) vendorNames.add(g.GRUPA);
  }

  const unmappedGroups = [];
  const groupRules = {};

  for (const g of grupi) {
    const name = g.GRUPA;
    let rule = GROUP_MAP[name];

    if (!rule && isVendorParent(g.PARENT_GR)) {
      rule = {
        category_id: "08.02-misc", // default until item-name inference
        action: "vendor_group",
        supplier_default: name,
        infer_category_from_item: true,
      };
    }

    // Vendor subfolder: parent is a firm name under 1. Фирми
    if (rule?.supplier_from_parent || (!rule && vendorNames.has(g.PARENT_GR))) {
      const parentIsVendor = vendorNames.has(g.PARENT_GR);
      if (parentIsVendor) {
        rule = {
          ...(rule || { category_id: "08.02-misc", infer_category_from_item: true }),
          action: rule?.action || "vendor_subgroup",
          supplier_default: g.PARENT_GR,
          infer_category_from_item: rule?.infer_category_from_item ?? !rule?.category_id,
        };
      }
    }

    if (!rule && THREAD_SUBGROUP_HINTS.some((h) => name.toLowerCase().includes(h))) {
      rule = { category_id: "01.03-thread-fittings" };
    }

    if (!rule && /кабел/i.test(name)) {
      rule = { category_id: "03.01-cables" };
    }

    if (!rule) {
      // inherit from parent map if possible
      const parentRule = GROUP_MAP[g.PARENT_GR];
      if (parentRule?.category_id) {
        rule = {
          category_id: parentRule.category_id,
          system_tags: parentRule.system_tags,
          supplier_default: parentRule.supplier_default,
          stock_location_hint: parentRule.stock_location_hint,
          inherited_from: g.PARENT_GR,
        };
      }
    }

    if (!rule) {
      unmappedGroups.push({
        group: name,
        parent: g.PARENT_GR || "(root)",
      });
      rule = {
        category_id: "08.02-misc",
        action: "unmapped_fallback",
      };
    }

    groupRules[name] = rule;
  }

  // Stock index: group+name → [{sklad, qty}]
  const stockKey = (g, n) => `${g}||${n}`;
  const stockByItem = new Map();
  for (const s of stoki) {
    const qty = Number(s.KOLICH || 0);
    const key = stockKey(s.GRUPA, s.STOKA);
    if (!stockByItem.has(key)) stockByItem.set(key, []);
    stockByItem.get(key).push({
      sklad: s.SKLAD || "",
      qty,
      group: s.GRUPA,
      name: s.STOKA,
    });
  }

  /** @type {Map<string, any>} softKey|category → merged article */
  const articles = new Map();
  const changes = {
    moved: [],
    vendor_extracted: [],
    system_tagged: [],
    tool_merges: [],
    name_normalized: [],
    fastener_size_collapsed: [],
    unmapped_groups: unmappedGroups,
  };

  let articleSeq = 0;

  for (const d of defs) {
    const oldGroup = d.GRUPA;
    const oldName = d.STOKA;
    const rule = groupRules[oldGroup] || {
      category_id: "08.02-misc",
      action: "missing_group",
    };

    let categoryId = rule.category_id || "08.02-misc";
    const systemTags = new Set(rule.system_tags || []);
    let supplier =
      rule.supplier_default ||
      (d.DOSTAW && String(d.DOSTAW).trim()) ||
      null;

    if (rule.action === "vendor_group" || vendorNames.has(oldGroup)) {
      supplier = supplier || oldGroup;
      if (rule.infer_category_from_item !== false) {
        categoryId = inferCategoryFromName(oldName, categoryId);
      }
      changes.vendor_extracted.push({
        old_group: oldGroup,
        name: oldName,
        supplier,
        new_category_id: categoryId,
      });
    }

    if (rule.action === "vendor_subgroup") {
      supplier = supplier || rule.supplier_default || null;
      changes.vendor_extracted.push({
        old_group: oldGroup,
        name: oldName,
        supplier,
        new_category_id: categoryId,
      });
    }

    // Second-pass inference for leftovers still on misc from weak folders
    if (categoryId === "08.02-misc") {
      categoryId = inferCategoryFromName(oldName, categoryId);
    }

    // Metal hydride group mixes tools + MH parts
    if (oldGroup === "Металхидрид" && TOOL_NAME_RE.test(oldName)) {
      categoryId = "06.01-hand-tools";
      systemTags.add("metal-hydride"); // provenance only
    }

    // Fastener size groups → attribute + finer leaf
    if (rule.fastener_size) {
      categoryId = classifyFastenerLeaf(oldName, categoryId);
      changes.fastener_size_collapsed.push({
        old_group: oldGroup,
        name: oldName,
        fastener_size: rule.fastener_size,
        new_category_id: categoryId,
      });
    } else if (categoryId?.startsWith("02.")) {
      categoryId = classifyFastenerLeaf(oldName, categoryId);
    }

    if (systemTags.size) {
      changes.system_tagged.push({
        old_group: oldGroup,
        name: oldName,
        tags: [...systemTags],
        new_category_id: categoryId,
      });
    }

    const newName = titleFirstWord(oldName);
    if (newName !== oldName) {
      changes.name_normalized.push({
        from: oldName,
        to: newName,
        old_group: oldGroup,
      });
    }

    const stocks = stockByItem.get(stockKey(oldGroup, oldName)) || [];
    const locationHint = rule.stock_location_hint || null;

    // Identity / merge rules (no data loss):
    // - Tools (1A): merge by soft name → one SKU, stock per location
    // - Other: always keep distinct by exact source group + original name
    //   (ITEM_ID and CODE are NOT unique in this MoneyWorks export)
    // - Soft duplicates flagged separately as merge_candidates
    const isTool = categoryId === "06.01-hand-tools";
    const meaningfulCode =
      d.CODE && d.CODE.trim() && d.CODE.trim() !== "-"
        ? d.CODE.trim()
        : null;

    const mapKey = isTool
      ? `tool:${softKey(newName)}`
      : `src:${oldGroup}||${oldName}`;

    const stockRows = stocks.map((s) => ({
      location:
        locationHint ||
        s.sklad ||
        (rule.stock_location_hint ? rule.stock_location_hint : "Склад"),
      qty: s.qty,
      source_group: oldGroup,
      source_sklad: s.sklad,
    }));

    if (!stockRows.length) {
      stockRows.push({
        location: locationHint || "Склад",
        qty: 0,
        source_group: oldGroup,
        source_sklad: "",
      });
    }

    if (articles.has(mapKey)) {
      const existing = articles.get(mapKey);
      existing.source_refs.push({
        group: oldGroup,
        name: oldName,
        code: d.CODE || null,
        barcode: d.BARCODE || null,
      });
      for (const sr of stockRows) {
        const hit = existing.stock_by_location.find(
          (x) => x.location === sr.location,
        );
        if (hit) hit.qty += sr.qty;
        else existing.stock_by_location.push({ ...sr });
      }
      if (supplier && !existing.supplier) existing.supplier = supplier;
      for (const t of systemTags) existing.system_tags.push(t);
      existing.system_tags = [...new Set(existing.system_tags)];
      if (isTool) {
        changes.tool_merges.push({
          canonical_name: existing.name,
          merged_from: { group: oldGroup, name: oldName },
          locations: existing.stock_by_location.map((x) => ({
            location: x.location,
            qty: x.qty,
          })),
        });
      }
      continue;
    }

    articleSeq += 1;
    const article = {
      id: `art-${String(articleSeq).padStart(5, "0")}`,
      name: newName,
      name_original: oldName,
      code: meaningfulCode,
      barcode: d.BARCODE || null,
      unit: d.RAZFAS1 || "бр.",
      category_id: categoryId,
      supplier,
      fastener_size: rule.fastener_size || null,
      system_tags: [...systemTags],
      stock_by_location: stockRows.map((s) => ({
        location: s.location,
        qty: s.qty,
      })),
      source_refs: [
        {
          group: oldGroup,
          name: oldName,
          code: d.CODE || null,
          barcode: d.BARCODE || null,
        },
      ],
      buy_price: Number(d.CENA_KUP || 0) || 0,
      active: String(d.IS_ACTIVE || "Y").toUpperCase() !== "N",
    };

    if (oldGroup !== categoryId) {
      changes.moved.push({
        name: newName,
        from_group: oldGroup,
        to_category_id: categoryId,
        supplier,
        system_tags: [...systemTags],
      });
    }

    articles.set(mapKey, article);
  }

  const articleList = [...articles.values()];

  // Flag merge candidates (soft-name twins that were NOT auto-merged)
  const softIndex = new Map();
  for (const a of articleList) {
    const k = softKey(a.name);
    if (!softIndex.has(k)) softIndex.set(k, []);
    softIndex.get(k).push(a);
  }
  const mergeCandidates = [];
  for (const [k, list] of softIndex) {
    if (list.length < 2) continue;
    if (list[0].category_id === "06.01-hand-tools") continue; // already merged
    mergeCandidates.push({
      soft_key: k,
      count: list.length,
      names: [...new Set(list.map((x) => x.name))],
      codes: [...new Set(list.map((x) => x.code).filter(Boolean))],
      categories: [...new Set(list.map((x) => x.category_id))],
      source_groups: [
        ...new Set(list.flatMap((x) => x.source_refs.map((r) => r.group))),
      ],
      article_ids: list.map((x) => x.id),
      reason:
        list.some((x) => x.code) &&
        new Set(list.map((x) => x.code).filter(Boolean)).size === 1
          ? "same_part_code_and_soft_name"
          : "same_soft_name",
    });
  }

  // Category counts
  const byCat = {};
  for (const a of articleList) {
    byCat[a.category_id] = (byCat[a.category_id] || 0) + 1;
  }

  const report = {
    decisions: {
      tools: "A — one SKU, stock per location",
      vendors: "A — category = type; vendor = field",
      systems: "A — flatten to type categories; system_tags for BOM context",
    },
    counts: {
      source_groups: grupi.length,
      source_active_defs: defs.length,
      source_stoki_rows: stoki.length,
      reorganised_articles: articleList.length,
      articles_reduction: defs.length - articleList.length,
      vendor_groups_detected: vendorNames.size,
      unmapped_groups: unmappedGroups.length,
      tool_merge_events: changes.tool_merges.length,
      merge_candidates_for_review: mergeCandidates.length,
      names_normalized: changes.name_normalized.length,
      vendor_items_extracted: changes.vendor_extracted.length,
      system_tagged_items: changes.system_tagged.length,
      fastener_items_from_size_groups: changes.fastener_size_collapsed.length,
    },
    taxonomy: TAXONOMY,
    group_mapping: Object.entries(groupRules).map(([old_group, rule]) => ({
      old_group,
      parent: groupsByName.get(old_group)?.PARENT_GR || "(root)",
      ...rule,
    })),
    category_item_counts: byCat,
    unmapped_groups: unmappedGroups,
    vendor_groups: [...vendorNames].sort(),
    sample_tool_merges: changes.tool_merges.slice(0, 30),
    sample_vendor_moves: changes.vendor_extracted.slice(0, 30),
    sample_system_tags: changes.system_tagged.slice(0, 30),
    sample_name_normalization: changes.name_normalized.slice(0, 40),
    merge_candidates: mergeCandidates.slice(0, 80),
  };

  const catalog = {
    meta: {
      generated_at: new Date().toISOString(),
      source: "MoneyWorks_Core_Warehouse_CSV",
      decisions: report.decisions,
      note: "Draft reorganisation — no DB write. Preserves all source_refs for audit.",
    },
    taxonomy: TAXONOMY,
    articles: articleList,
  };

  const changeLog = {
    meta: catalog.meta,
    counts: report.counts,
    unmapped_groups: unmappedGroups,
    tool_merges: changes.tool_merges,
    vendor_extracted: changes.vendor_extracted,
    system_tagged: changes.system_tagged,
    fastener_size_collapsed: changes.fastener_size_collapsed,
    name_normalized: changes.name_normalized,
    merge_candidates: mergeCandidates,
    // moved is huge — summarize by from→to
    moves_by_from_to: summarizeMoves(changes.moved),
  };

  fs.writeFileSync(
    path.join(ROOT, "WH_data_reorganised_updated.json"),
    JSON.stringify(catalog, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(ROOT, "WH_reorg_mapping_updated.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(ROOT, "WH_reorg_change_report_updated.json"),
    JSON.stringify(changeLog, null, 2),
    "utf8",
  );

  console.log(JSON.stringify(report.counts, null, 2));
  console.log("Unmapped groups:", unmappedGroups.length);
  if (unmappedGroups.length) {
    console.log(unmappedGroups.slice(0, 40));
  }
  console.log("Wrote WH_data_reorganised_updated.json");
  console.log("Wrote WH_reorg_mapping_updated.json");
  console.log("Wrote WH_reorg_change_report_updated.json");
}

function summarizeMoves(moved) {
  const m = new Map();
  for (const x of moved) {
    const k = `${x.from_group} => ${x.to_category_id}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ move: key, count }))
    .sort((a, b) => b.count - a.count);
}

main();
