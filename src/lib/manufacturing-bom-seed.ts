import {
  Project,
  WarehouseBom,
  WarehouseBomLine,
  WarehouseGroup,
  WarehouseItem,
  WarehouseLot,
  WarehouseMovement,
  WarehouseState,
  amountIncFromEx,
} from "./types";
import { cloneLocation, roundMoney } from "./warehouse";

export const SEBESTOYNOST_SEED_SOURCE = "sebestoynost-500kw-z-series";
export const SEBESTOYNOST_PROJECT_NAME = "Example 500kW Z-Series";
export const SEBESTOYNOST_BOM_SOURCE_KEY = `manual:${SEBESTOYNOST_SEED_SOURCE}`;

export type SebestoynostSeedItem = {
  name: string;
  sku?: string | null;
  unit: string;
  qty: number;
  unitCostExVat: number;
  lineCostExVat: number;
  supplier?: string | null;
  sourceRow?: number;
};

export type SebestoynostSeedGroup = {
  name: string;
  items: SebestoynostSeedItem[];
};

export type SebestoynostSeedModule = {
  name: string;
  groups: SebestoynostSeedGroup[];
};

export type SebestoynostSeed = {
  sourceFile?: string;
  project: {
    name: string;
    series: string;
    sizeKw: number;
    client: string;
    city: string;
    country: string;
    notes?: string;
  };
  modules: SebestoynostSeedModule[];
};

function roundQty(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function normalizeCatalogName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u201c\u201d\u2018\u2019`]/g, '"')
    .replace(/[×xх]/gi, "x")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case ALL-CAPS Bulgarian/Latin section labels for catalog groups. */
export function displayGroupName(name: string): string {
  const letters = name.replace(/[^A-Za-zА-Яа-яЁёІі]/g, "");
  if (letters.length >= 2 && letters === letters.toLocaleUpperCase("bg")) {
    return name
      .split(/\s+/)
      .map((w) =>
        w
          ? w.charAt(0).toLocaleUpperCase("bg") +
            w.slice(1).toLocaleLowerCase("bg")
          : w,
      )
      .join(" ");
  }
  return name;
}

function findExistingItem(
  items: WarehouseItem[],
  name: string,
  sku?: string | null,
): WarehouseItem | undefined {
  const skuTrim = sku?.trim();
  if (skuTrim) {
    const bySku = items.find(
      (i) => i.sku && i.sku.trim().toLowerCase() === skuTrim.toLowerCase(),
    );
    if (bySku) return bySku;
  }
  const key = normalizeCatalogName(name);
  return items.find((i) => normalizeCatalogName(i.name) === key);
}

export type ApplySebestoynostSeedResult = {
  warehouse: WarehouseState;
  projectId: string;
  projectCreated: boolean;
  alreadyApplied: boolean;
  stats: {
    modules: number;
    subgroups: number;
    itemsMatched: number;
    itemsCreated: number;
    lotsCreated: number;
    consumedLines: number;
    totalExVat: number;
    totalIncVat: number;
  };
};

/**
 * Merge the себестойност BOM into warehouse as used-material history only:
 * catalog groups/items + receive/consume movements, no on-hand balances,
 * no cashflow expenses.
 */
export function applySebestoynostManufacturingSeed(args: {
  seed: SebestoynostSeed;
  warehouse: WarehouseState;
  projectId: string;
  asOfDate?: string;
}): ApplySebestoynostSeedResult {
  const { seed, projectId } = args;
  const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const seedNote = `seed:${SEBESTOYNOST_SEED_SOURCE}`;

  const alreadyApplied = args.warehouse.lots.some(
    (l) => l.notes?.includes(seedNote) || l.label?.includes(seedNote),
  );
  if (alreadyApplied) {
    return {
      warehouse: args.warehouse,
      projectId,
      projectCreated: false,
      alreadyApplied: true,
      stats: {
        modules: 0,
        subgroups: 0,
        itemsMatched: 0,
        itemsCreated: 0,
        lotsCreated: 0,
        consumedLines: 0,
        totalExVat: 0,
        totalIncVat: 0,
      },
    };
  }

  const groups = [...args.warehouse.groups];
  const items = [...args.warehouse.items];
  const lots = [...args.warehouse.lots];
  const movements = [...args.warehouse.movements];
  const boms = [...args.warehouse.boms];
  const bomLines = [...args.warehouse.bomLines];

  const groupBySource = new Map(
    groups.filter((g) => g.sourceKey).map((g) => [g.sourceKey!, g]),
  );

  function ensureGroup(
    name: string,
    sourceKey: string,
    parentId?: string,
  ): WarehouseGroup {
    const existing = groupBySource.get(sourceKey);
    if (existing) return existing;
    const g: WarehouseGroup = {
      id: crypto.randomUUID(),
      name: displayGroupName(name),
      sourceKey,
      createdAt: now,
      ...(parentId ? { parentId } : {}),
    };
    groups.push(g);
    groupBySource.set(sourceKey, g);
    return g;
  }

  let itemsMatched = 0;
  let itemsCreated = 0;
  let lotsCreated = 0;
  let consumedLines = 0;
  let totalExVat = 0;
  let totalIncVat = 0;
  let subgroupCount = 0;

  const bomLineDrafts: WarehouseBomLine[] = [];
  let bomPosition = 0;

  const projectLoc = cloneLocation({
    site: "ELX",
    slot: "project",
    projectId,
  });

  for (const mod of seed.modules) {
    const parent = ensureGroup(
      mod.name,
      `sebestoynost:module:${mod.name}`,
    );
    for (const grp of mod.groups) {
      subgroupCount += 1;
      const child = ensureGroup(
        grp.name,
        `sebestoynost:module:${mod.name}:group:${grp.name}`,
        parent.id,
      );
      for (const raw of grp.items) {
        const name = raw.name.trim();
        if (!name) continue;
        const qty = Number(raw.qty) || 0;
        const unitEx = Math.max(0, Number(raw.unitCostExVat) || 0);
        const unitInc = amountIncFromEx(unitEx);
        const lineEx =
          Number(raw.lineCostExVat) > 0
            ? Number(raw.lineCostExVat)
            : roundMoney(qty * unitEx);

        let item = findExistingItem(items, name, raw.sku);
        if (item) {
          itemsMatched += 1;
          item = {
            ...item,
            groupId: child.id,
            unit: raw.unit?.trim() || item.unit,
            ...(raw.sku?.trim() && !item.sku ? { sku: raw.sku.trim() } : {}),
            preferredSupplier:
              raw.supplier?.trim() || item.preferredSupplier,
            systemTags: Array.from(
              new Set([
                ...(item.systemTags ?? []),
                "electrolyzer",
                "z-series",
                "mfg-bom-500kw",
              ]),
            ),
          };
          const idx = items.findIndex((i) => i.id === item!.id);
          if (idx >= 0) items[idx] = item;
        } else {
          itemsCreated += 1;
          item = {
            id: crypto.randomUUID(),
            name,
            ...(raw.sku?.trim() ? { sku: raw.sku.trim() } : {}),
            unit: raw.unit?.trim() || "бр.",
            defaultMaterialKind: "materials",
            groupId: child.id,
            ...(raw.supplier?.trim()
              ? { preferredSupplier: raw.supplier.trim() }
              : {}),
            systemTags: ["electrolyzer", "z-series", "mfg-bom-500kw"],
            createdAt: now,
          };
          items.push(item);
        }

        bomPosition += 1;
        const componentGroup = `${displayGroupName(mod.name)} / ${displayGroupName(grp.name)}`;
        bomLineDrafts.push({
          id: crypto.randomUUID(),
          bomId: "", // filled after BOM header
          position: bomPosition,
          componentName: item.name,
          componentGroup,
          componentItemId: item.id,
          qtyPerUnit: roundQty(Math.max(qty, 0)),
          unitCost: unitInc,
          createdAt: now,
        });

        if (!(qty > 0)) continue;

        const lotId = crypto.randomUUID();
        const lot: WarehouseLot = {
          id: lotId,
          itemId: item.id,
          qtyReceived: qty,
          unitCostIncVat: unitInc,
          unitCostExVat: unitEx,
          receivedAt: asOf,
          purchaseProjectId: projectId,
          category: "materials",
          label: `${SEBESTOYNOST_PROJECT_NAME} BOM`,
          notes: `${seedNote}; ${componentGroup}`,
          ...(raw.supplier?.trim() ? { supplier: raw.supplier.trim() } : {}),
          createdAt: now,
        };
        lots.push(lot);
        lotsCreated += 1;

        const receiveId = crypto.randomUUID();
        const consumeId = crypto.randomUUID();
        const receiveMv: WarehouseMovement = {
          id: receiveId,
          lotId,
          action: "receive",
          qty,
          to: projectLoc,
          occurredAt: now,
          note: `${seedNote}: receive (history only)`,
        };
        const consumeMv: WarehouseMovement = {
          id: consumeId,
          lotId,
          action: "consume",
          qty,
          from: projectLoc,
          occurredAt: new Date(Date.parse(now) + 1).toISOString(),
          note: `${seedNote}: consumed for manufacture (no on-hand stock)`,
        };
        // Newest-first list convention in the app
        movements.unshift(consumeMv, receiveMv);
        consumedLines += 1;
        totalExVat = roundMoney(totalExVat + lineEx);
        totalIncVat = roundMoney(totalIncVat + amountIncFromEx(lineEx));
      }
    }
  }

  // Upsert BOM recipe
  const existingBom = boms.find((b) => b.sourceKey === SEBESTOYNOST_BOM_SOURCE_KEY);
  const bomId = existingBom?.id ?? crypto.randomUUID();
  const bom: WarehouseBom = {
    id: bomId,
    name: "500kW Z-Series electrolyser (себестойност)",
    outputGroup: "Електролизьор",
    productFamily: "Z Series",
    sourceKey: SEBESTOYNOST_BOM_SOURCE_KEY,
    qtyProduced: 1,
    unitCost: totalIncVat,
    notes:
      seed.project.notes ??
      "Baseline manufacturing BOM from себестойност workbook (used-material history).",
    createdAt: existingBom?.createdAt ?? now,
  };
  if (existingBom) {
    const bi = boms.findIndex((b) => b.id === bomId);
    boms[bi] = bom;
  } else {
    boms.push(bom);
  }
  const nextBomLines = bomLines.filter((l) => l.bomId !== bomId);
  for (const line of bomLineDrafts) {
    nextBomLines.push({ ...line, bomId });
  }

  return {
    warehouse: {
      ...args.warehouse,
      groups,
      items,
      lots,
      balances: args.warehouse.balances, // unchanged — history only
      movements,
      boms,
      bomLines: nextBomLines,
    },
    projectId,
    projectCreated: false,
    alreadyApplied: false,
    stats: {
      modules: seed.modules.length,
      subgroups: subgroupCount,
      itemsMatched,
      itemsCreated,
      lotsCreated,
      consumedLines,
      totalExVat,
      totalIncVat,
    },
  };
}

export function findSebestoynostProject(
  projects: Project[],
): Project | undefined {
  return projects.find(
    (p) =>
      !p.isWarehouseHolding &&
      p.name.trim().toLowerCase() ===
        SEBESTOYNOST_PROJECT_NAME.toLowerCase(),
  );
}
