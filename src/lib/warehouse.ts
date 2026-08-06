import {
  ProjectExpenseCategory,
  ProjectExpenseSubcategory,
  WarehouseBalance,
  WarehouseLocation,
  WarehouseLot,
  WarehouseMaterialKind,
  WarehouseMovement,
  WarehouseState,
  amountExFromInc,
  emptyWarehouseState,
} from "./types";

export function locationKey(loc: WarehouseLocation): string {
  if (loc.type === "project") return `project:${loc.projectId ?? ""}`;
  return loc.type;
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
  if (loc.type === "spare") return "Spares";
  if (loc.type === "buffer") return "Buffer";
  if (loc.type === "unallocated") return "Unallocated";
  const name = loc.projectId
    ? (projectName?.(loc.projectId) ?? loc.projectId)
    : "Project";
  return name;
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
  if (loc.type === "project" && loc.projectId) return loc.projectId;
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
      location:
        loc.type === "project"
          ? { type: "project", projectId: loc.projectId }
          : { type: loc.type },
      qty: delta,
    });
  }
  return next;
}

export function stockValueAtLocation(
  lots: WarehouseLot[],
  balances: WarehouseBalance[],
  locType: "spare" | "buffer" | "project" | "unallocated",
  projectId?: string,
): number {
  let total = 0;
  for (const b of balances) {
    if (b.location.type !== locType) continue;
    if (locType === "project" && b.location.projectId !== projectId) continue;
    const lot = lots.find((l) => l.id === b.lotId);
    if (!lot) continue;
    total += b.qty * lot.unitCostIncVat;
  }
  return roundMoney(total);
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

export function loadWarehouseState(): WarehouseState {
  try {
    const raw = window.localStorage.getItem("hydrogenera-warehouse-v1");
    if (!raw) return emptyWarehouseState();
    const parsed = JSON.parse(raw) as Partial<WarehouseState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
      balances: Array.isArray(parsed.balances) ? parsed.balances : [],
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
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
