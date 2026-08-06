import {
  WarehouseBalance,
  WarehouseItem,
  WarehouseLocation,
  WarehouseLocationType,
  WarehouseLot,
  WarehouseMovement,
  WarehouseMovementAction,
  WarehouseState,
  emptyWarehouseState,
  isProjectExpenseCategory,
  isProjectExpenseSubcategory,
} from "./types";
import { supabase } from "./supabase";

export interface WarehouseItemRow {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  default_material_kind: string;
  created_at: string;
}

export interface WarehouseLotRow {
  id: string;
  item_id: string;
  qty_received: number | string;
  unit_cost_inc_vat: number | string;
  unit_cost_ex_vat: number | string;
  received_at: string;
  purchase_project_id: string;
  expense_id: string;
  category: string;
  subcategory: string | null;
  supplier: string | null;
  notes: string | null;
  label: string | null;
  created_at: string;
}

export interface WarehouseBalanceRow {
  id: string;
  lot_id: string;
  location_type: string;
  project_id: string | null;
  qty: number | string;
}

export interface WarehouseMovementRow {
  id: string;
  lot_id: string;
  action: string;
  qty: number | string;
  from_location_type: string | null;
  from_project_id: string | null;
  to_location_type: string | null;
  to_project_id: string | null;
  occurred_at: string;
  note: string | null;
}

function num(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function locFromParts(
  type: string | null | undefined,
  projectId: string | null | undefined,
): WarehouseLocation | undefined {
  if (!type) return undefined;
  if (type === "project") {
    return { type: "project", projectId: projectId ?? undefined };
  }
  if (
    type === "spare" ||
    type === "buffer" ||
    type === "unallocated"
  ) {
    return { type };
  }
  return undefined;
}

function locToParts(loc: WarehouseLocation | undefined): {
  location_type: string | null;
  project_id: string | null;
} {
  if (!loc) return { location_type: null, project_id: null };
  if (loc.type === "project") {
    return { location_type: "project", project_id: loc.projectId ?? null };
  }
  return { location_type: loc.type, project_id: null };
}

export function itemFromRow(row: WarehouseItemRow): WarehouseItem {
  const kind = row.default_material_kind;
  return {
    id: row.id,
    name: row.name,
    ...(row.sku ? { sku: row.sku } : {}),
    unit: row.unit || "pcs",
    defaultMaterialKind:
      kind === "installation" || kind === "maintenance" || kind === "materials"
        ? kind
        : "materials",
    createdAt: row.created_at,
  };
}

export function itemToRow(item: WarehouseItem): WarehouseItemRow {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? null,
    unit: item.unit,
    default_material_kind: item.defaultMaterialKind,
    created_at: item.createdAt,
  };
}

export function lotFromRow(row: WarehouseLotRow): WarehouseLot {
  const category = isProjectExpenseCategory(row.category)
    ? row.category
    : "materials";
  const lot: WarehouseLot = {
    id: row.id,
    itemId: row.item_id,
    qtyReceived: num(row.qty_received),
    unitCostIncVat: num(row.unit_cost_inc_vat),
    unitCostExVat: num(row.unit_cost_ex_vat),
    receivedAt: row.received_at.slice(0, 10),
    purchaseProjectId: row.purchase_project_id,
    expenseId: row.expense_id,
    category,
    createdAt: row.created_at,
  };
  if (
    row.subcategory &&
    isProjectExpenseSubcategory(row.subcategory)
  ) {
    lot.subcategory = row.subcategory;
  }
  if (row.supplier) lot.supplier = row.supplier;
  if (row.notes) lot.notes = row.notes;
  if (row.label) lot.label = row.label;
  return lot;
}

export function lotToRow(lot: WarehouseLot): WarehouseLotRow {
  return {
    id: lot.id,
    item_id: lot.itemId,
    qty_received: lot.qtyReceived,
    unit_cost_inc_vat: lot.unitCostIncVat,
    unit_cost_ex_vat: lot.unitCostExVat,
    received_at: lot.receivedAt,
    purchase_project_id: lot.purchaseProjectId,
    expense_id: lot.expenseId,
    category: lot.category,
    subcategory: lot.subcategory ?? null,
    supplier: lot.supplier ?? null,
    notes: lot.notes ?? null,
    label: lot.label ?? null,
    created_at: lot.createdAt,
  };
}

export function balanceFromRow(row: WarehouseBalanceRow): WarehouseBalance {
  const location: WarehouseLocation =
    row.location_type === "project"
      ? { type: "project", projectId: row.project_id ?? undefined }
      : { type: row.location_type as WarehouseLocationType };
  return {
    id: row.id,
    lotId: row.lot_id,
    location,
    qty: num(row.qty),
  };
}

export function balanceToRow(b: WarehouseBalance): WarehouseBalanceRow {
  return {
    id: b.id,
    lot_id: b.lotId,
    location_type: b.location.type,
    project_id:
      b.location.type === "project" ? (b.location.projectId ?? null) : null,
    qty: b.qty,
  };
}

export function movementFromRow(row: WarehouseMovementRow): WarehouseMovement {
  const m: WarehouseMovement = {
    id: row.id,
    lotId: row.lot_id,
    action: row.action as WarehouseMovementAction,
    qty: num(row.qty),
    occurredAt: row.occurred_at,
  };
  const from = locFromParts(row.from_location_type, row.from_project_id);
  const to = locFromParts(row.to_location_type, row.to_project_id);
  if (from) m.from = from;
  if (to) m.to = to;
  if (row.note) m.note = row.note;
  return m;
}

export function movementToRow(m: WarehouseMovement): WarehouseMovementRow {
  const from = locToParts(m.from);
  const to = locToParts(m.to);
  return {
    id: m.id,
    lot_id: m.lotId,
    action: m.action,
    qty: m.qty,
    from_location_type: from.location_type,
    from_project_id: from.project_id,
    to_location_type: to.location_type,
    to_project_id: to.project_id,
    occurred_at: m.occurredAt,
    note: m.note ?? null,
  };
}

export async function loadRemoteWarehouseState(
  holdingProjectId: string | null,
): Promise<WarehouseState | null> {
  if (!supabase) return null;
  const [itemsRes, lotsRes, balRes, movRes] = await Promise.all([
    supabase.from("warehouse_items").select("*").order("created_at"),
    supabase.from("warehouse_lots").select("*").order("created_at"),
    supabase.from("warehouse_balances").select("*"),
    supabase
      .from("warehouse_movements")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(5000),
  ]);
  if (itemsRes.error || lotsRes.error || balRes.error || movRes.error) {
    console.error(
      "Warehouse load failed:",
      itemsRes.error?.message ??
        lotsRes.error?.message ??
        balRes.error?.message ??
        movRes.error?.message,
    );
    return null;
  }
  return {
    items: ((itemsRes.data ?? []) as WarehouseItemRow[]).map(itemFromRow),
    lots: ((lotsRes.data ?? []) as WarehouseLotRow[]).map(lotFromRow),
    balances: ((balRes.data ?? []) as WarehouseBalanceRow[]).map(balanceFromRow),
    movements: ((movRes.data ?? []) as WarehouseMovementRow[]).map(
      movementFromRow,
    ),
    holdingProjectId,
  };
}

/** Full replace sync (small inventory). */
export async function persistRemoteWarehouseState(
  state: WarehouseState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "No database" };

  const itemRows = state.items.map(itemToRow);
  const lotRows = state.lots.map(lotToRow);
  const balRows = state.balances.map(balanceToRow);
  const movRows = state.movements.slice(0, 5000).map(movementToRow);

  // Upsert parents first, then replace child tables for this dataset.
  if (itemRows.length > 0) {
    const { error } = await supabase
      .from("warehouse_items")
      .upsert(itemRows, { onConflict: "id" });
    if (error) return { ok: false, error: error.message };
  }
  if (lotRows.length > 0) {
    const { error } = await supabase
      .from("warehouse_lots")
      .upsert(lotRows, { onConflict: "id" });
    if (error) return { ok: false, error: error.message };
  }

  // Balances / movements: delete missing, upsert current
  const { data: existingBal } = await supabase
    .from("warehouse_balances")
    .select("id");
  const balIds = new Set(balRows.map((b) => b.id));
  const balToDelete = ((existingBal ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !balIds.has(id));
  if (balToDelete.length > 0) {
    const { error } = await supabase
      .from("warehouse_balances")
      .delete()
      .in("id", balToDelete);
    if (error) return { ok: false, error: error.message };
  }
  if (balRows.length > 0) {
    const { error } = await supabase
      .from("warehouse_balances")
      .upsert(balRows, { onConflict: "id" });
    if (error) return { ok: false, error: error.message };
  }

  const { data: existingMov } = await supabase
    .from("warehouse_movements")
    .select("id")
    .limit(10000);
  const movIds = new Set(movRows.map((m) => m.id));
  const movToDelete = ((existingMov ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !movIds.has(id));
  if (movToDelete.length > 0) {
    // Chunk deletes
    for (let i = 0; i < movToDelete.length; i += 200) {
      const chunk = movToDelete.slice(i, i + 200);
      const { error } = await supabase
        .from("warehouse_movements")
        .delete()
        .in("id", chunk);
      if (error) return { ok: false, error: error.message };
    }
  }
  if (movRows.length > 0) {
    const { error } = await supabase
      .from("warehouse_movements")
      .upsert(movRows, { onConflict: "id" });
    if (error) return { ok: false, error: error.message };
  }

  // Remove orphaned lots/items no longer present
  const { data: allLots } = await supabase.from("warehouse_lots").select("id");
  const lotIds = new Set(lotRows.map((l) => l.id));
  const lotsToDelete = ((allLots ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !lotIds.has(id));
  if (lotsToDelete.length > 0) {
    const { error } = await supabase
      .from("warehouse_lots")
      .delete()
      .in("id", lotsToDelete);
    if (error) return { ok: false, error: error.message };
  }

  const { data: allItems } = await supabase.from("warehouse_items").select("id");
  const itemIds = new Set(itemRows.map((i) => i.id));
  const itemsToDelete = ((allItems ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !itemIds.has(id));
  if (itemsToDelete.length > 0) {
    const { error } = await supabase
      .from("warehouse_items")
      .delete()
      .in("id", itemsToDelete);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export function mergeLocalWarehouseFallback(
  remote: WarehouseState | null,
  local: WarehouseState,
): WarehouseState {
  if (!remote) return local;
  // Prefer remote when it has any data; else keep local (first migration).
  const remoteHasData =
    remote.items.length > 0 ||
    remote.lots.length > 0 ||
    remote.balances.length > 0;
  if (remoteHasData) {
    return {
      ...remote,
      holdingProjectId: remote.holdingProjectId ?? local.holdingProjectId,
    };
  }
  return {
    ...local,
    holdingProjectId: local.holdingProjectId ?? remote.holdingProjectId,
  };
}

export { emptyWarehouseState };
