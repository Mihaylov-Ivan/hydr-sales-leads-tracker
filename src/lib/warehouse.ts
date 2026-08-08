import {
  ProjectExpenseCategory,
  ProjectExpenseSubcategory,
  WarehouseBalance,
  WarehouseBom,
  WarehouseBomLine,
  WarehouseGroup,
  WarehouseItem,
  WarehouseLocation,
  WarehouseLot,
  WarehouseMaterialKind,
  WarehouseMovement,
  WarehouseSerial,
  WarehouseSite,
  WarehouseSlot,
  WarehouseState,
  WAREHOUSE_SITE_LABELS,
  WAREHOUSE_SLOT_LABELS,
  amountExFromInc,
  emptyWarehouseState,
} from "./types";

const SITES = new Set<WarehouseSite>(["ELX", "MH", "Van"]);
const SLOTS = new Set<WarehouseSlot>(["project", "spare", "buffer"]);

/** Normalize any location shape (new or legacy localStorage) to site×slot. */
export function normalizeLocation(raw: unknown): WarehouseLocation | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;

  // New shape
  if (typeof o.site === "string" && typeof o.slot === "string") {
    const site = o.site as WarehouseSite;
    const slot = o.slot as WarehouseSlot;
    if (!SITES.has(site) || !SLOTS.has(slot)) return undefined;
    if (slot === "project") {
      const projectId =
        typeof o.projectId === "string" ? o.projectId : undefined;
      return { site, slot: "project", projectId };
    }
    return { site, slot };
  }

  // Legacy: { type: project|spare|buffer|unallocated, projectId? }
  if (typeof o.type === "string") {
    const site: WarehouseSite = "ELX";
    if (o.type === "project") {
      return {
        site,
        slot: "project",
        projectId: typeof o.projectId === "string" ? o.projectId : undefined,
      };
    }
    if (o.type === "spare") return { site, slot: "spare" };
    if (o.type === "buffer" || o.type === "unallocated") {
      return { site, slot: "buffer" };
    }
  }
  return undefined;
}

export function cloneLocation(loc: WarehouseLocation): WarehouseLocation {
  if (loc.slot === "project") {
    return { site: loc.site, slot: "project", projectId: loc.projectId };
  }
  return { site: loc.site, slot: loc.slot };
}

export function locationKey(loc: WarehouseLocation): string {
  if (loc.slot === "project") {
    return `${loc.site}:project:${loc.projectId ?? ""}`;
  }
  return `${loc.site}:${loc.slot}`;
}

export function locationsEqual(
  a: WarehouseLocation,
  b: WarehouseLocation,
): boolean {
  return locationKey(a) === locationKey(b);
}

export function locationLabel(
  loc: WarehouseLocation,
  projectName?: (id: string) => string | undefined,
): string {
  const site = WAREHOUSE_SITE_LABELS[loc.site] ?? loc.site;
  if (loc.slot === "project") {
    const name = loc.projectId
      ? (projectName?.(loc.projectId) ?? loc.projectId)
      : "Project";
    return `${site} / ${name}`;
  }
  return `${site} / ${WAREHOUSE_SLOT_LABELS[loc.slot]}`;
}

export function materialKindToExpense(
  kind: WarehouseMaterialKind,
): {
  category: ProjectExpenseCategory;
  subcategory?: ProjectExpenseSubcategory;
} {
  if (kind === "installation") {
    return {
      category: "installation",
      subcategory: "installation-equipment",
    };
  }
  if (kind === "maintenance") {
    return {
      category: "maintenance",
      subcategory: "maintenance-parts",
    };
  }
  return { category: "materials" };
}

/** Project that should hold the expense for stock at this location. */
export function expenseProjectIdForLocation(
  loc: WarehouseLocation,
  holdingProjectId: string,
): string {
  if (loc.slot === "project" && loc.projectId) return loc.projectId;
  return holdingProjectId;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lotQtyOnHand(
  balances: WarehouseBalance[],
  lotId: string,
): number {
  return balances
    .filter((b) => b.lotId === lotId)
    .reduce((s, b) => s + b.qty, 0);
}

export function findBalance(
  balances: WarehouseBalance[],
  lotId: string,
  loc: WarehouseLocation,
): WarehouseBalance | undefined {
  return balances.find(
    (b) => b.lotId === lotId && locationsEqual(b.location, loc),
  );
}

export function applyBalanceDelta(
  balances: WarehouseBalance[],
  lotId: string,
  loc: WarehouseLocation,
  delta: number,
): WarehouseBalance[] {
  const next = [...balances];
  const idx = next.findIndex(
    (b) => b.lotId === lotId && locationsEqual(b.location, loc),
  );
  if (idx >= 0) {
    const qty = Math.round((next[idx].qty + delta) * 10000) / 10000;
    if (qty <= 0.0001) next.splice(idx, 1);
    else next[idx] = { ...next[idx], qty };
  } else if (delta > 0) {
    next.push({
      id: crypto.randomUUID(),
      lotId,
      location: cloneLocation(loc),
      qty: delta,
    });
  }
  return next;
}

export function stockValueAtSlot(
  lots: WarehouseLot[],
  balances: WarehouseBalance[],
  slot: WarehouseSlot,
  opts?: { site?: WarehouseSite; projectId?: string },
): number {
  let total = 0;
  for (const b of balances) {
    if (b.location.slot !== slot) continue;
    if (opts?.site && b.location.site !== opts.site) continue;
    if (slot === "project" && opts?.projectId != null) {
      if (b.location.projectId !== opts.projectId) continue;
    }
    const lot = lots.find((l) => l.id === b.lotId);
    if (!lot) continue;
    total += b.qty * lot.unitCostIncVat;
  }
  return roundMoney(total);
}

/** @deprecated Prefer stockValueAtSlot */
export function stockValueAtLocation(
  lots: WarehouseLot[],
  balances: WarehouseBalance[],
  locType: "spare" | "buffer" | "project" | "unallocated",
  projectId?: string,
): number {
  const slot: WarehouseSlot =
    locType === "unallocated" ? "buffer" : locType;
  return stockValueAtSlot(lots, balances, slot, { projectId });
}

export function totalStockValue(
  lots: WarehouseLot[],
  balances: WarehouseBalance[],
): number {
  let total = 0;
  for (const b of balances) {
    const lot = lots.find((l) => l.id === b.lotId);
    if (!lot) continue;
    total += b.qty * lot.unitCostIncVat;
  }
  return roundMoney(total);
}

export function openLotsCount(
  lots: WarehouseLot[],
  balances: WarehouseBalance[],
): number {
  return lots.filter((l) => lotQtyOnHand(balances, l.id) > 0).length;
}

export function lotReceiptValue(lot: WarehouseLot): number {
  return roundMoney(lot.qtyReceived * lot.unitCostIncVat);
}

export function lotReceiptValueEx(lot: WarehouseLot): number {
  return roundMoney(lot.qtyReceived * lot.unitCostExVat);
}

/** Sum of receipt values for lots whose expenseId points at this expense. */
export function spentAgainstExpense(
  lots: WarehouseLot[],
  expenseId: string,
): number {
  return roundMoney(
    lots
      .filter((l) => l.expenseId === expenseId)
      .reduce((s, l) => s + lotReceiptValue(l), 0),
  );
}

export function spentAgainstExpenseEx(
  lots: WarehouseLot[],
  expenseId: string,
): number {
  return roundMoney(
    lots
      .filter((l) => l.expenseId === expenseId)
      .reduce((s, l) => s + lotReceiptValueEx(l), 0),
  );
}

/**
 * Predicted (unpaid) envelope expense — not a 1:1 warehouse cash line.
 * Multiple WH lots can draw against it via lot.expenseId.
 */
export function isBudgetEnvelopeExpense(
  expense: { actualDate?: string; warehouseLotId?: string },
): boolean {
  return !expense.actualDate && !expense.warehouseLotId;
}

/**
 * When amount is about to change on a budget envelope, keep the first predicted
 * amount as budgetAmount (never overwrite once set).
 */
export function preserveBudgetAmount(
  expense: { amount: number; budgetAmount?: number; warehouseLotId?: string },
  nextAmount: number,
): number | undefined {
  if (expense.warehouseLotId) return expense.budgetAmount;
  if (expense.budgetAmount != null && expense.budgetAmount > 0) {
    return roundMoney(expense.budgetAmount);
  }
  if (Math.abs(nextAmount - expense.amount) < 0.01) return undefined;
  if (!(expense.amount > 0)) return undefined;
  return roundMoney(expense.amount);
}

function migrateBalance(raw: unknown): WarehouseBalance | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.lotId !== "string") return null;
  const loc = normalizeLocation(o.location);
  if (!loc) return null;
  const qty = typeof o.qty === "number" ? o.qty : Number(o.qty);
  if (!Number.isFinite(qty)) return null;
  const b: WarehouseBalance = { id: o.id, lotId: o.lotId, location: loc, qty };
  if (typeof o.sourceSklad === "string" && o.sourceSklad) {
    b.sourceSklad = o.sourceSklad;
  }
  return b;
}

function migrateLot(raw: unknown): WarehouseLot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string") return null;
  const lot: WarehouseLot = {
    id: o.id,
    itemId: o.itemId,
    qtyReceived: Number(o.qtyReceived) || 0,
    unitCostIncVat: Number(o.unitCostIncVat) || 0,
    unitCostExVat: Number(o.unitCostExVat) || 0,
    receivedAt: String(o.receivedAt ?? "").slice(0, 10),
    purchaseProjectId: String(o.purchaseProjectId ?? ""),
    category: (o.category as WarehouseLot["category"]) || "materials",
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.expenseId === "string" && o.expenseId) lot.expenseId = o.expenseId;
  if (o.subcategory) lot.subcategory = o.subcategory as WarehouseLot["subcategory"];
  if (typeof o.supplier === "string") lot.supplier = o.supplier;
  if (typeof o.notes === "string") lot.notes = o.notes;
  if (typeof o.label === "string") lot.label = o.label;
  if (typeof o.sourceSklad === "string") lot.sourceSklad = o.sourceSklad;
  return lot;
}

function migrateItem(raw: unknown): WarehouseItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const item: WarehouseItem = {
    id: o.id,
    name: o.name,
    unit: typeof o.unit === "string" ? o.unit : "pcs",
    defaultMaterialKind:
      o.defaultMaterialKind === "installation" ||
      o.defaultMaterialKind === "maintenance"
        ? o.defaultMaterialKind
        : "materials",
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.sku === "string" && o.sku) item.sku = o.sku;
  if (typeof o.barcode === "string" && o.barcode) item.barcode = o.barcode;
  if (typeof o.groupId === "string" && o.groupId) item.groupId = o.groupId;
  if (typeof o.minQty === "number") item.minQty = o.minQty;
  if (typeof o.maxQty === "number") item.maxQty = o.maxQty;
  if (typeof o.tracksSerial === "boolean") item.tracksSerial = o.tracksSerial;
  if (typeof o.preferredSupplier === "string" && o.preferredSupplier) {
    item.preferredSupplier = o.preferredSupplier;
  }
  if (Array.isArray(o.systemTags)) {
    item.systemTags = o.systemTags.filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
  }
  if (typeof o.legacyGroupName === "string" && o.legacyGroupName) {
    item.legacyGroupName = o.legacyGroupName;
  }
  if (typeof o.nameOriginal === "string" && o.nameOriginal) {
    item.nameOriginal = o.nameOriginal;
  }
  return item;
}

function migrateMovement(raw: unknown): WarehouseMovement | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.lotId !== "string") return null;
  const m: WarehouseMovement = {
    id: o.id,
    lotId: o.lotId,
    action: (o.action as WarehouseMovement["action"]) || "adjust",
    qty: Number(o.qty) || 0,
    occurredAt: String(o.occurredAt ?? new Date().toISOString()),
  };
  const from = normalizeLocation(o.from);
  const to = normalizeLocation(o.to);
  if (from) m.from = from;
  if (to) m.to = to;
  if (typeof o.note === "string") m.note = o.note;
  return m;
}

function migrateGroup(raw: unknown): WarehouseGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const g: WarehouseGroup = {
    id: o.id,
    name: o.name,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.parentId === "string") g.parentId = o.parentId;
  if (typeof o.sourceKey === "string") g.sourceKey = o.sourceKey;
  return g;
}

function migrateSerial(raw: unknown): WarehouseSerial | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string") return null;
  if (typeof o.serial !== "string") return null;
  const loc = normalizeLocation(o.location);
  if (!loc) return null;
  const s: WarehouseSerial = {
    id: o.id,
    itemId: o.itemId,
    serial: o.serial,
    location: loc,
    qty: Number(o.qty) || 1,
    status:
      o.status === "consumed" || o.status === "disposed"
        ? o.status
        : "in_stock",
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.lotId === "string") s.lotId = o.lotId;
  if (typeof o.sourceSklad === "string") s.sourceSklad = o.sourceSklad;
  return s;
}

function migrateBom(raw: unknown): WarehouseBom | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (typeof o.sourceKey !== "string") return null;
  const bom: WarehouseBom = {
    id: o.id,
    name: o.name,
    sourceKey: o.sourceKey,
    qtyProduced: Number(o.qtyProduced) || 0,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.outputGroup === "string") bom.outputGroup = o.outputGroup;
  if (typeof o.productFamily === "string") bom.productFamily = o.productFamily;
  if (typeof o.outputItemId === "string") bom.outputItemId = o.outputItemId;
  if (typeof o.unitCost === "number" && Number.isFinite(o.unitCost)) {
    bom.unitCost = o.unitCost;
  }
  if (typeof o.notes === "string") bom.notes = o.notes;
  return bom;
}

function migrateBomLine(raw: unknown): WarehouseBomLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.bomId !== "string") return null;
  if (typeof o.componentName !== "string") return null;
  const line: WarehouseBomLine = {
    id: o.id,
    bomId: o.bomId,
    position: Number(o.position) || 0,
    componentName: o.componentName,
    qtyPerUnit: Number(o.qtyPerUnit) || 0,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
  if (typeof o.componentGroup === "string") {
    line.componentGroup = o.componentGroup;
  }
  if (typeof o.componentItemId === "string") {
    line.componentItemId = o.componentItemId;
  }
  if (typeof o.unitCost === "number" && Number.isFinite(o.unitCost)) {
    line.unitCost = o.unitCost;
  }
  return line;
}

export function loadWarehouseState(): WarehouseState {
  try {
    const raw = window.localStorage.getItem("hydrogenera-warehouse-v1");
    if (!raw) return emptyWarehouseState();
    const parsed = JSON.parse(raw) as Partial<WarehouseState> & {
      items?: unknown[];
      lots?: unknown[];
      balances?: unknown[];
      movements?: unknown[];
      groups?: unknown[];
      serials?: unknown[];
      boms?: unknown[];
      bomLines?: unknown[];
    };
    return {
      items: (parsed.items ?? []).map(migrateItem).filter(Boolean) as WarehouseItem[],
      lots: (parsed.lots ?? []).map(migrateLot).filter(Boolean) as WarehouseLot[],
      balances: (parsed.balances ?? [])
        .map(migrateBalance)
        .filter(Boolean) as WarehouseBalance[],
      movements: (parsed.movements ?? [])
        .map(migrateMovement)
        .filter(Boolean) as WarehouseMovement[],
      groups: (parsed.groups ?? [])
        .map(migrateGroup)
        .filter(Boolean) as WarehouseGroup[],
      serials: (parsed.serials ?? [])
        .map(migrateSerial)
        .filter(Boolean) as WarehouseSerial[],
      boms: (parsed.boms ?? []).map(migrateBom).filter(Boolean) as WarehouseBom[],
      bomLines: (parsed.bomLines ?? [])
        .map(migrateBomLine)
        .filter(Boolean) as WarehouseBomLine[],
      holdingProjectId:
        typeof parsed.holdingProjectId === "string"
          ? parsed.holdingProjectId
          : null,
    };
  } catch {
    return emptyWarehouseState();
  }
}

export function saveWarehouseState(state: WarehouseState): void {
  try {
    window.localStorage.setItem(
      "hydrogenera-warehouse-v1",
      JSON.stringify(state),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function unitCostExFromInc(
  inc: number,
  ex?: number | null,
): number {
  if (ex != null && Number.isFinite(ex) && ex > 0) return roundMoney(ex);
  return amountExFromInc(inc);
}

export function movementSummary(
  action: WarehouseMovement["action"],
  qty: number,
  fromLabel?: string,
  toLabel?: string,
): string {
  if (action === "receive") {
    return `Received ${qty}${toLabel ? ` into ${toLabel}` : ""}`;
  }
  if (action === "consume") {
    return `Consumed ${qty}${fromLabel ? ` from ${fromLabel}` : ""}`;
  }
  if (action === "adjust") {
    return `Adjusted ${qty}${fromLabel ? ` at ${fromLabel}` : ""}`;
  }
  if (action === "allocate" || action === "transfer") {
    return `Moved ${qty}${fromLabel ? ` from ${fromLabel}` : ""}${toLabel ? ` to ${toLabel}` : ""}`;
  }
  return `${action} ${qty}`;
}
