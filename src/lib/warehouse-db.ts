import {
  WarehouseBalance,
  WarehouseBom,
  WarehouseBomLine,
  WarehouseGroup,
  WarehouseItem,
  WarehouseLocation,
  WarehouseLot,
  WarehouseMovement,
  WarehouseMovementAction,
  WarehouseSerial,
  WarehouseSerialStatus,
  WarehouseSite,
  WarehouseSlot,
  WarehouseState,
  emptyWarehouseState,
  isProjectExpenseCategory,
  isProjectExpenseSubcategory,
} from "./types";
import { cloneLocation, normalizeLocation } from "./warehouse";
import { supabase } from "./supabase";

export interface WarehouseGroupRow {
  id: string;
  name: string;
  parent_id: string | null;
  source_key: string | null;
  created_at: string;
}

export interface WarehouseItemRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  default_material_kind: string;
  group_id: string | null;
  min_qty: number | string | null;
  max_qty: number | string | null;
  tracks_serial: boolean;
  preferred_supplier?: string | null;
  system_tags?: unknown;
  legacy_group_name?: string | null;
  name_original?: string | null;
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
  expense_id: string | null;
  category: string;
  subcategory: string | null;
  supplier: string | null;
  notes: string | null;
  label: string | null;
  source_sklad: string | null;
  created_at: string;
}

export interface WarehouseBalanceRow {
  id: string;
  lot_id: string;
  location_type: string | null;
  site: string;
  slot: string;
  project_id: string | null;
  qty: number | string;
  source_sklad?: string | null;
}

export interface WarehouseMovementRow {
  id: string;
  lot_id: string;
  action: string;
  qty: number | string;
  from_location_type: string | null;
  from_project_id: string | null;
  from_site: string | null;
  from_slot: string | null;
  to_location_type: string | null;
  to_project_id: string | null;
  to_site: string | null;
  to_slot: string | null;
  occurred_at: string;
  note: string | null;
}

export interface WarehouseSerialRow {
  id: string;
  item_id: string;
  lot_id: string | null;
  serial: string;
  site: string;
  slot: string;
  project_id: string | null;
  qty: number | string;
  status: string;
  source_sklad: string | null;
  created_at: string;
}

export interface WarehouseBomRow {
  id: string;
  name: string;
  output_group: string | null;
  product_family: string | null;
  output_item_id: string | null;
  source_key: string;
  qty_produced: number | string;
  unit_cost: number | string | null;
  notes: string | null;
  created_at: string;
}

export interface WarehouseBomLineRow {
  id: string;
  bom_id: string;
  position: number;
  component_name: string;
  component_group: string | null;
  component_item_id: string | null;
  qty_per_unit: number | string;
  unit_cost: number | string | null;
  created_at: string;
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function locFromParts(
  site: string | null | undefined,
  slot: string | null | undefined,
  projectId: string | null | undefined,
  legacyType?: string | null,
): WarehouseLocation | undefined {
  if (site && slot) {
    return normalizeLocation({
      site,
      slot,
      projectId: projectId ?? undefined,
    });
  }
  if (legacyType) {
    return normalizeLocation({
      type: legacyType,
      projectId: projectId ?? undefined,
    });
  }
  return undefined;
}

function locToParts(loc: WarehouseLocation | undefined): {
  site: string | null;
  slot: string | null;
  project_id: string | null;
  location_type: string | null;
} {
  if (!loc) {
    return { site: null, slot: null, project_id: null, location_type: null };
  }
  return {
    site: loc.site,
    slot: loc.slot,
    project_id: loc.slot === "project" ? (loc.projectId ?? null) : null,
    // Legacy mirror for older readers
    location_type: loc.slot,
  };
}

export function groupFromRow(row: WarehouseGroupRow): WarehouseGroup {
  const g: WarehouseGroup = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
  if (row.parent_id) g.parentId = row.parent_id;
  if (row.source_key) g.sourceKey = row.source_key;
  return g;
}

export function groupToRow(g: WarehouseGroup): WarehouseGroupRow {
  return {
    id: g.id,
    name: g.name,
    parent_id: g.parentId ?? null,
    source_key: g.sourceKey ?? null,
    created_at: g.createdAt,
  };
}

export function itemFromRow(row: WarehouseItemRow): WarehouseItem {
  const kind = row.default_material_kind;
  const item: WarehouseItem = {
    id: row.id,
    name: row.name,
    unit: row.unit || "pcs",
    defaultMaterialKind:
      kind === "installation" || kind === "maintenance" || kind === "materials"
        ? kind
        : "materials",
    createdAt: row.created_at,
    tracksSerial: Boolean(row.tracks_serial),
  };
  if (row.sku) item.sku = row.sku;
  if (row.barcode) item.barcode = row.barcode;
  if (row.group_id) item.groupId = row.group_id;
  if (row.min_qty != null && Number.isFinite(num(row.min_qty))) {
    item.minQty = num(row.min_qty);
  }
  if (row.max_qty != null && Number.isFinite(num(row.max_qty))) {
    item.maxQty = num(row.max_qty);
  }
  if (row.preferred_supplier) item.preferredSupplier = row.preferred_supplier;
  if (Array.isArray(row.system_tags)) {
    item.systemTags = row.system_tags.filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
  }
  if (row.legacy_group_name) item.legacyGroupName = row.legacy_group_name;
  if (row.name_original) item.nameOriginal = row.name_original;
  return item;
}

export function itemToRow(item: WarehouseItem): WarehouseItemRow {
  const createdAt = (() => {
    const d = String(item.createdAt ?? "").trim();
    if (d && !/^\d+(\.\d+)?$/.test(d) && Number.isFinite(Date.parse(d))) {
      return new Date(d).toISOString();
    }
    return new Date().toISOString();
  })();
  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? null,
    barcode: item.barcode ?? null,
    unit: item.unit,
    default_material_kind: item.defaultMaterialKind,
    group_id: item.groupId ?? null,
    min_qty: item.minQty ?? null,
    max_qty: item.maxQty ?? null,
    tracks_serial: Boolean(item.tracksSerial),
    preferred_supplier: item.preferredSupplier ?? null,
    system_tags: item.systemTags ?? [],
    legacy_group_name: item.legacyGroupName ?? null,
    name_original: item.nameOriginal ?? null,
    created_at: createdAt,
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
    category,
    createdAt: row.created_at,
  };
  if (row.expense_id) lot.expenseId = row.expense_id;
  if (row.subcategory && isProjectExpenseSubcategory(row.subcategory)) {
    lot.subcategory = row.subcategory;
  }
  if (row.supplier) lot.supplier = row.supplier;
  if (row.notes) lot.notes = row.notes;
  if (row.label) lot.label = row.label;
  if (row.source_sklad) lot.sourceSklad = row.source_sklad;
  return lot;
}

export function lotToRow(lot: WarehouseLot): WarehouseLotRow {
  const receivedAt = (() => {
    const d = String(lot.receivedAt ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  })();
  const createdAt = (() => {
    const d = String(lot.createdAt ?? "").trim();
    if (d && !/^\d+(\.\d+)?$/.test(d) && Number.isFinite(Date.parse(d))) {
      return new Date(d).toISOString();
    }
    return new Date().toISOString();
  })();
  return {
    id: lot.id,
    item_id: lot.itemId,
    qty_received: lot.qtyReceived,
    unit_cost_inc_vat: lot.unitCostIncVat,
    unit_cost_ex_vat: lot.unitCostExVat,
    received_at: receivedAt,
    purchase_project_id: lot.purchaseProjectId,
    expense_id: lot.expenseId ?? null,
    category: lot.category,
    subcategory: lot.subcategory ?? null,
    supplier: lot.supplier ?? null,
    notes: lot.notes ?? null,
    label: lot.label ?? null,
    source_sklad: lot.sourceSklad ?? null,
    created_at: createdAt,
  };
}

export function balanceFromRow(row: WarehouseBalanceRow): WarehouseBalance {
  const location =
    locFromParts(row.site, row.slot, row.project_id, row.location_type) ?? {
      site: "ELX" as WarehouseSite,
      slot: "spare" as WarehouseSlot,
    };
  const b: WarehouseBalance = {
    id: row.id,
    lotId: row.lot_id,
    location,
    qty: num(row.qty),
  };
  if (row.source_sklad) b.sourceSklad = row.source_sklad;
  return b;
}

export function balanceToRow(b: WarehouseBalance): WarehouseBalanceRow {
  const parts = locToParts(b.location);
  return {
    id: b.id,
    lot_id: b.lotId,
    location_type: parts.location_type,
    site: parts.site ?? "ELX",
    slot: parts.slot ?? "spare",
    project_id: parts.project_id,
    qty: b.qty,
    source_sklad: b.sourceSklad ?? null,
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
  const from = locFromParts(
    row.from_site,
    row.from_slot,
    row.from_project_id,
    row.from_location_type,
  );
  const to = locFromParts(
    row.to_site,
    row.to_slot,
    row.to_project_id,
    row.to_location_type,
  );
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
    from_site: from.site,
    from_slot: from.slot,
    to_location_type: to.location_type,
    to_project_id: to.project_id,
    to_site: to.site,
    to_slot: to.slot,
    occurred_at: m.occurredAt,
    note: m.note ?? null,
  };
}

export function serialFromRow(row: WarehouseSerialRow): WarehouseSerial {
  const location =
    locFromParts(row.site, row.slot, row.project_id) ?? {
      site: "ELX" as WarehouseSite,
      slot: "spare" as WarehouseSlot,
    };
  const s: WarehouseSerial = {
    id: row.id,
    itemId: row.item_id,
    serial: row.serial,
    location,
    qty: num(row.qty) || 1,
    status: (row.status as WarehouseSerialStatus) || "in_stock",
    createdAt: row.created_at,
  };
  if (row.lot_id) s.lotId = row.lot_id;
  if (row.source_sklad) s.sourceSklad = row.source_sklad;
  return s;
}

export function serialToRow(s: WarehouseSerial): WarehouseSerialRow {
  const parts = locToParts(s.location);
  return {
    id: s.id,
    item_id: s.itemId,
    lot_id: s.lotId ?? null,
    serial: s.serial,
    site: parts.site ?? "ELX",
    slot: parts.slot ?? "spare",
    project_id: parts.project_id,
    qty: s.qty,
    status: s.status,
    source_sklad: s.sourceSklad ?? null,
    created_at: s.createdAt,
  };
}

export function bomFromRow(row: WarehouseBomRow): WarehouseBom {
  const bom: WarehouseBom = {
    id: row.id,
    name: row.name,
    sourceKey: row.source_key,
    qtyProduced: num(row.qty_produced),
    createdAt: row.created_at,
  };
  if (row.output_group) bom.outputGroup = row.output_group;
  if (row.product_family) bom.productFamily = row.product_family;
  if (row.output_item_id) bom.outputItemId = row.output_item_id;
  if (row.unit_cost != null && Number.isFinite(num(row.unit_cost))) {
    bom.unitCost = num(row.unit_cost);
  }
  if (row.notes) bom.notes = row.notes;
  return bom;
}

export function bomToRow(b: WarehouseBom): WarehouseBomRow {
  return {
    id: b.id,
    name: b.name,
    output_group: b.outputGroup ?? null,
    product_family: b.productFamily ?? null,
    output_item_id: b.outputItemId ?? null,
    source_key: b.sourceKey,
    qty_produced: b.qtyProduced,
    unit_cost: b.unitCost ?? null,
    notes: b.notes ?? null,
    created_at: b.createdAt,
  };
}

export function bomLineFromRow(row: WarehouseBomLineRow): WarehouseBomLine {
  const line: WarehouseBomLine = {
    id: row.id,
    bomId: row.bom_id,
    position: row.position,
    componentName: row.component_name,
    qtyPerUnit: num(row.qty_per_unit),
    createdAt: row.created_at,
  };
  if (row.component_group) line.componentGroup = row.component_group;
  if (row.component_item_id) line.componentItemId = row.component_item_id;
  if (row.unit_cost != null && Number.isFinite(num(row.unit_cost))) {
    line.unitCost = num(row.unit_cost);
  }
  return line;
}

export function bomLineToRow(l: WarehouseBomLine): WarehouseBomLineRow {
  return {
    id: l.id,
    bom_id: l.bomId,
    position: l.position,
    component_name: l.componentName,
    component_group: l.componentGroup ?? null,
    component_item_id: l.componentItemId ?? null,
    qty_per_unit: l.qtyPerUnit,
    unit_cost: l.unitCost ?? null,
    created_at: l.createdAt,
  };
}

export async function loadRemoteWarehouseState(
  holdingProjectId: string | null,
): Promise<WarehouseState | null> {
  if (!supabase) return null;
  const [
    itemsRes,
    lotsRes,
    balRes,
    movRes,
    groupsRes,
    serialsRes,
    bomsRes,
    bomLinesRes,
  ] = await Promise.all([
      supabase.from("warehouse_items").select("*").order("created_at"),
      supabase.from("warehouse_lots").select("*").order("created_at"),
      supabase.from("warehouse_balances").select("*"),
      supabase
        .from("warehouse_movements")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(5000),
      supabase.from("warehouse_groups").select("*").order("name"),
      supabase.from("warehouse_serials").select("*").order("serial"),
      supabase.from("warehouse_boms").select("*").order("name"),
      supabase.from("warehouse_bom_lines").select("*").order("position"),
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
  // Groups/serials/boms tables may not exist until later migrations are applied
  if (groupsRes.error) {
    console.warn("Warehouse groups load:", groupsRes.error.message);
  }
  if (serialsRes.error) {
    console.warn("Warehouse serials load:", serialsRes.error.message);
  }
  if (bomsRes.error) {
    console.warn("Warehouse boms load:", bomsRes.error.message);
  }
  if (bomLinesRes.error) {
    console.warn("Warehouse bom lines load:", bomLinesRes.error.message);
  }
  return {
    items: ((itemsRes.data ?? []) as WarehouseItemRow[]).map(itemFromRow),
    lots: ((lotsRes.data ?? []) as WarehouseLotRow[]).map(lotFromRow),
    balances: ((balRes.data ?? []) as WarehouseBalanceRow[]).map(balanceFromRow),
    movements: ((movRes.data ?? []) as WarehouseMovementRow[]).map(
      movementFromRow,
    ),
    groups: groupsRes.error
      ? []
      : ((groupsRes.data ?? []) as WarehouseGroupRow[]).map(groupFromRow),
    serials: serialsRes.error
      ? []
      : ((serialsRes.data ?? []) as WarehouseSerialRow[]).map(serialFromRow),
    boms: bomsRes.error
      ? []
      : ((bomsRes.data ?? []) as WarehouseBomRow[]).map(bomFromRow),
    bomLines: bomLinesRes.error
      ? []
      : ((bomLinesRes.data ?? []) as WarehouseBomLineRow[]).map(bomLineFromRow),
    holdingProjectId,
  };
}

function dedupeRowsById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

async function upsertChunks<T extends { id: string }>(
  table: string,
  rows: T[],
  chunkSize = 200,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase || rows.length === 0) return { ok: true };
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: "id" });
    if (error) return { ok: false, error: `${table}: ${error.message}` };
  }
  return { ok: true };
}

async function deleteByIds(
  table: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase || ids.length === 0) return { ok: true };
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { error } = await supabase.from(table).delete().in("id", chunk);
    if (error) return { ok: false, error: `${table} delete: ${error.message}` };
  }
  return { ok: true };
}

/** Full replace sync (small inventory). */
export async function persistRemoteWarehouseState(
  state: WarehouseState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "No database" };

  const groupRows = dedupeRowsById(state.groups.map(groupToRow));
  const groupIds = new Set(groupRows.map((g) => g.id));
  // Never write item.group_id that isn't in this payload (FK would fail).
  const itemRows = dedupeRowsById(state.items.map(itemToRow)).map((row) => ({
    ...row,
    group_id:
      row.group_id && groupIds.has(row.group_id) ? row.group_id : null,
  }));
  const itemIds = new Set(itemRows.map((i) => i.id));
  const lotRows = dedupeRowsById(state.lots.map(lotToRow)).filter((l) =>
    itemIds.has(l.item_id),
  );
  const lotIds = new Set(lotRows.map((l) => l.id));
  const balRows = dedupeRowsById(state.balances.map(balanceToRow)).filter((b) =>
    lotIds.has(b.lot_id),
  );
  const movRows = dedupeRowsById(
    state.movements.slice(0, 5000).map(movementToRow),
  ).filter((m) => lotIds.has(m.lot_id));
  const serialRows = dedupeRowsById(state.serials.map(serialToRow)).filter(
    (s) => itemIds.has(s.item_id),
  );
  const bomRows = dedupeRowsById(state.boms.map(bomToRow)).map((row) => ({
    ...row,
    output_item_id:
      row.output_item_id && itemIds.has(row.output_item_id)
        ? row.output_item_id
        : null,
  }));
  const bomIds = new Set(bomRows.map((b) => b.id));
  const bomLineRows = dedupeRowsById(state.bomLines.map(bomLineToRow))
    .filter((l) => bomIds.has(l.bom_id))
    .map((row) => ({
      ...row,
      component_item_id:
        row.component_item_id && itemIds.has(row.component_item_id)
          ? row.component_item_id
          : null,
    }));

  const balIds = new Set(balRows.map((b) => b.id));
  const movIds = new Set(movRows.map((m) => m.id));
  const serIds = new Set(serialRows.map((s) => s.id));
  const bomLineIds = new Set(bomLineRows.map((l) => l.id));

  // --- Remove orphans first (child → parent) so upserts/deletes don't hit FKs ---
  {
    const { data: existingLines } = await supabase
      .from("warehouse_bom_lines")
      .select("id");
    if (!existingLines) {
      // table may be missing until migration-026
    } else {
      const lineToDelete = ((existingLines ?? []) as { id: string }[])
        .map((r) => r.id)
        .filter((id) => !bomLineIds.has(id));
      const lineDel = await deleteByIds("warehouse_bom_lines", lineToDelete);
      if (!lineDel.ok) {
        console.warn("warehouse_bom_lines delete:", lineDel.error);
      }
    }
  }

  {
    const { data: existingBoms } = await supabase
      .from("warehouse_boms")
      .select("id");
    if (existingBoms) {
      const bomToDelete = ((existingBoms ?? []) as { id: string }[])
        .map((r) => r.id)
        .filter((id) => !bomIds.has(id));
      const bomDel = await deleteByIds("warehouse_boms", bomToDelete);
      if (!bomDel.ok) {
        console.warn("warehouse_boms delete:", bomDel.error);
      }
    }
  }

  {
    const { data: existingSer } = await supabase
      .from("warehouse_serials")
      .select("id");
    const serToDelete = ((existingSer ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !serIds.has(id));
    const serDel = await deleteByIds("warehouse_serials", serToDelete);
    if (!serDel.ok) return serDel;
  }

  {
    const { data: existingMov } = await supabase
      .from("warehouse_movements")
      .select("id")
      .limit(10000);
    const movToDelete = ((existingMov ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !movIds.has(id));
    const movDel = await deleteByIds("warehouse_movements", movToDelete);
    if (!movDel.ok) return movDel;
  }

  {
    const { data: existingBal } = await supabase
      .from("warehouse_balances")
      .select("id");
    const balToDelete = ((existingBal ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !balIds.has(id));
    const balDel = await deleteByIds("warehouse_balances", balToDelete);
    if (!balDel.ok) return balDel;
  }

  {
    const { data: allLots } = await supabase.from("warehouse_lots").select("id");
    const lotsToDelete = ((allLots ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !lotIds.has(id));
    const lotDel = await deleteByIds("warehouse_lots", lotsToDelete);
    if (!lotDel.ok) return lotDel;
  }

  // Clear item FKs so stale items can be replaced.
  {
    const { error } = await supabase
      .from("warehouse_items")
      .update({ group_id: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.warn("clear item group_id:", error.message);
    }
  }
  {
    const { error } = await supabase
      .from("warehouse_boms")
      .update({ output_item_id: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.warn("clear bom output_item_id:", error.message);
    }
  }
  {
    const { error } = await supabase
      .from("warehouse_bom_lines")
      .update({ component_item_id: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.warn("clear bom line component_item_id:", error.message);
    }
  }

  {
    const { data: allItems } = await supabase
      .from("warehouse_items")
      .select("id");
    const itemsToDelete = ((allItems ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !itemIds.has(id));
    const itemDel = await deleteByIds("warehouse_items", itemsToDelete);
    if (!itemDel.ok) return itemDel;
  }

  if (groupRows.length > 0) {
    const { data: existingGroups } = await supabase
      .from("warehouse_groups")
      .select("id,source_key");
    const ourKeys = new Set(
      groupRows.map((g) => g.source_key).filter((k): k is string => Boolean(k)),
    );
    const staleGroupIds = ((existingGroups ?? []) as {
      id: string;
      source_key: string | null;
    }[])
      .filter(
        (g) =>
          !groupIds.has(g.id) &&
          (g.source_key == null || ourKeys.has(g.source_key)),
      )
      .map((g) => g.id);
    const groupDel = await deleteByIds("warehouse_groups", staleGroupIds);
    if (!groupDel.ok) return groupDel;

    const roots = groupRows.map((g) => ({ ...g, parent_id: null }));
    const rootRes = await upsertChunks("warehouse_groups", roots);
    if (!rootRes.ok) return rootRes;
    const withParents = groupRows.filter((g) => g.parent_id);
    if (withParents.length > 0) {
      const parentRes = await upsertChunks("warehouse_groups", withParents);
      if (!parentRes.ok) {
        console.warn("warehouse_groups parent links:", parentRes.error);
      }
    }
  }

  // --- Upsert current rows (parents → children) ---
  const itemsRes = await upsertChunks("warehouse_items", itemRows);
  if (!itemsRes.ok) return itemsRes;

  const lotsRes = await upsertChunks("warehouse_lots", lotRows);
  if (!lotsRes.ok) return lotsRes;

  const balRes = await upsertChunks("warehouse_balances", balRows);
  if (!balRes.ok) return balRes;

  const movRes = await upsertChunks("warehouse_movements", movRows);
  if (!movRes.ok) return movRes;

  const serRes = await upsertChunks("warehouse_serials", serialRows);
  if (!serRes.ok) {
    console.warn("warehouse_serials upsert:", serRes.error);
  }

  const bomRes = await upsertChunks("warehouse_boms", bomRows);
  if (!bomRes.ok) {
    console.warn("warehouse_boms upsert:", bomRes.error);
  } else {
    const lineRes = await upsertChunks("warehouse_bom_lines", bomLineRows);
    if (!lineRes.ok) {
      console.warn("warehouse_bom_lines upsert:", lineRes.error);
    }
  }

  return { ok: true };
}

export function mergeLocalWarehouseFallback(
  remote: WarehouseState | null,
  local: WarehouseState,
): WarehouseState {
  if (!remote) return local;
  const remoteHasData =
    remote.items.length > 0 ||
    remote.lots.length > 0 ||
    remote.balances.length > 0;
  if (remoteHasData) {
    return {
      ...remote,
      groups: remote.groups.length > 0 ? remote.groups : local.groups,
      serials: remote.serials.length > 0 ? remote.serials : local.serials,
      boms: remote.boms.length > 0 ? remote.boms : local.boms,
      bomLines:
        remote.bomLines.length > 0 ? remote.bomLines : local.bomLines,
      holdingProjectId: remote.holdingProjectId ?? local.holdingProjectId,
    };
  }
  return {
    ...local,
    holdingProjectId: local.holdingProjectId ?? remote.holdingProjectId,
  };
}

export { emptyWarehouseState, cloneLocation };

export async function persistRemoteSkladMaps(
  maps: {
    id: string;
    sourceSklad: string;
    projectId: string;
    site: string;
    slot: string;
    createdAt: string;
  }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "No database" };
  if (maps.length === 0) return { ok: true };
  const rows = maps.map((m) => ({
    id: m.id,
    source_sklad: m.sourceSklad,
    project_id: m.projectId,
    site: m.site,
    slot: m.slot,
    created_at: m.createdAt,
  }));
  const { error } = await supabase
    .from("warehouse_sklad_maps")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    // Table may not exist until migration-025 — non-fatal for local remap
    console.warn("warehouse_sklad_maps upsert:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
