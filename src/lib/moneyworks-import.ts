/**
 * MoneyWorks → app warehouse import (qty>0 snapshot).
 * Source: templates/warehouse-data/MoneyWorks_Core_Warehouse_CSV
 */

import {
  WarehouseBalance,
  WarehouseGroup,
  WarehouseItem,
  WarehouseLocation,
  WarehouseLot,
  WarehouseSerial,
  WarehouseSite,
  WarehouseSlot,
  WarehouseState,
  emptyWarehouseState,
} from "./types";
import { cloneLocation } from "./warehouse";
import { createHash } from "crypto";

export interface MoneyWorksImportResult {
  state: Omit<WarehouseState, "holdingProjectId">;
  stats: {
    groups: number;
    items: number;
    lots: number;
    balances: number;
    serials: number;
    skippedZero: number;
    skippedInactiveWh: number;
    parkedSystem: number;
    bySite: Record<WarehouseSite, number>;
  };
  warnings: string[];
}

export function parseCsv(text: string): Record<string, string>[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === "\n") {
      lines.push(cur);
      cur = "";
    } else if (c === "\r") {
      // skip
    } else {
      cur += c;
    }
  }
  if (cur.length) lines.push(cur);
  if (lines.length === 0) return [];

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cell += '"';
            i++;
          } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        out.push(cell);
        cell = "";
      } else cell += ch;
    }
    out.push(cell);
    return out;
  }

  const headers = splitLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

const INACTIVE_SKLAD = new Set([
  "Неактивен 1",
  "Неактивен 2",
  "Неактивен 3",
  "Суровини",
  "Услуги",
  "",
]);

const PRODUCTION_SKLAD = [
  "Склад производство, 500kW",
  "Склад 3, 10/30kW",
  "3. ПРОИЗВОДСТВО",
  "Цех",
];

export function mapSkladToLocation(skladRaw: string): {
  location: WarehouseLocation;
  parkedSystem: boolean;
  skip: boolean;
} {
  const sklad = skladRaw.trim();
  if (INACTIVE_SKLAD.has(sklad)) {
    return {
      location: { site: "ELX", slot: "spare" },
      parkedSystem: false,
      skip: true,
    };
  }
  if (sklad === "2. МЕТАЛХИДРИД") {
    return {
      location: { site: "MH", slot: "spare" },
      parkedSystem: false,
      skip: false,
    };
  }
  if (sklad === "1. СКЛАД - Ford Transit") {
    return {
      location: { site: "Van", slot: "spare" },
      parkedSystem: false,
      skip: false,
    };
  }
  if (PRODUCTION_SKLAD.includes(sklad)) {
    return {
      location: { site: "ELX", slot: "buffer" },
      parkedSystem: false,
      skip: false,
    };
  }
  if (sklad.startsWith("System -") || sklad.startsWith("System - ")) {
    return {
      location: { site: "ELX", slot: "buffer" },
      parkedSystem: true,
      skip: false,
    };
  }
  // ОСНОВЕН, legacy Склад, everything else active → ELX spare
  return {
    location: { site: "ELX", slot: "spare" },
    parkedSystem: false,
    skip: false,
  };
}

function num(v: string | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Accept only calendar dates like 2025-08-06 (optionally with time suffix). */
function sanitizeDate(
  raw: string | undefined | null,
  fallback: string,
): string {
  if (raw == null) return fallback;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return fallback;
  const day = m[1]!;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return fallback;
  // Reject absurd / placeholder years
  const year = Number(day.slice(0, 4));
  if (year < 1990 || year > 2100) return fallback;
  return day;
}

function sanitizeTimestamp(
  raw: string | undefined | null,
  fallbackIso: string,
): string {
  if (raw == null || !String(raw).trim()) return fallbackIso;
  const s = String(raw).trim();
  // Numeric epoch-ish placeholders from Firebird exports ("0", "1300161340")
  if (/^\d+(\.\d+)?$/.test(s) && !s.includes("-")) return fallbackIso;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return fallbackIso;
  return new Date(t).toISOString();
}

function articleKey(grupa: string, stoka: string): string {
  return `${grupa.trim()}||${stoka.trim()}`;
}

/** Deterministic UUID v4-shaped id from an arbitrary key (SHA-256). */
function uuidFromKey(key: string): string {
  const digest = createHash("sha256").update(key, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function dedupeById<T extends { id: string }>(rows: T[], label: string, warnings: string[]): T[] {
  const seen = new Map<string, T>();
  let dupes = 0;
  for (const row of rows) {
    if (seen.has(row.id)) {
      dupes++;
      continue;
    }
    seen.set(row.id, row);
  }
  if (dupes > 0) {
    warnings.push(`Dropped ${dupes} duplicate ${label} ids after hash collision check`);
  }
  return [...seen.values()];
}

export interface MoneyWorksCsvBundle {
  grupi: string;
  stokiDef: string;
  stoki: string;
  serNo: string;
  kupuwaItems?: string;
  kupuwa?: string;
}

/**
 * Build warehouse inventory from MoneyWorks CSV text.
 * Snapshot: one opening lot per positive STOKI row (costs from CENA_KUP).
 * Serials with qty>0 imported. Groups from GRUPI.
 */
export function buildWarehouseFromMoneyWorks(
  csv: MoneyWorksCsvBundle,
  opts: { holdingProjectId: string; asOfDate?: string },
): MoneyWorksImportResult {
  const warnings: string[] = [];
  const asOf = opts.asOfDate ?? new Date().toISOString().slice(0, 10);
  const holdingId = opts.holdingProjectId;

  const grupiRows = parseCsv(csv.grupi);
  const defRows = parseCsv(csv.stokiDef);
  const stokiRows = parseCsv(csv.stoki);
  const serRows = parseCsv(csv.serNo);

  // --- Groups ---
  const groups: WarehouseGroup[] = [];
  const groupIdByName = new Map<string, string>();
  for (const row of grupiRows) {
    const name = (row.GRUPA || "").trim();
    if (!name) continue;
    const id = uuidFromKey(`group:${name}`);
    groupIdByName.set(name, id);
    groups.push({
      id,
      name,
      sourceKey: name,
      createdAt: new Date().toISOString(),
      ...(row.PARENT_GR?.trim()
        ? { parentId: uuidFromKey(`group:${row.PARENT_GR.trim()}`) }
        : {}),
    });
  }

  // Wire parent ids only when parent group exists
  for (const g of groups) {
    if (g.parentId && !groups.some((x) => x.id === g.parentId)) {
      delete g.parentId;
    }
  }

  // Last purchase cost / supplier from KUPUWA_ITEMS if present
  const lastBuy = new Map<
    string,
    { unitCost: number; supplier?: string; date?: string }
  >();
  if (csv.kupuwaItems) {
    const kupItems = parseCsv(csv.kupuwaItems);
    const kupHeaders = csv.kupuwa ? parseCsv(csv.kupuwa) : [];
    const firmaByDoc = new Map<string, string>();
    for (const k of kupHeaders) {
      const key = `${k.DATETIME}|${k.NUM}`;
      if (k.FIRMA) firmaByDoc.set(key, k.FIRMA.trim());
    }
    for (const row of kupItems) {
      const key = articleKey(row.GRUPA || "", row.STOKA || "");
      const unit =
        num(row.KUP_CENA) > 0
          ? num(row.KUP_CENA)
          : num(row.CENA) > 0
            ? num(row.CENA) / Math.max(num(row.KOLICH), 1)
            : 0;
      // CENA in sample looks like line total sometimes — prefer KUP_CENA
      const unitCost = num(row.KUP_CENA) > 0 ? num(row.KUP_CENA) : unit;
      const docKey = `${row.DATETIME}|${row.NUM}`;
      const supplier = firmaByDoc.get(docKey);
      const dateRaw = (row.ENDDATE || "").trim();
      const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw)
        ? sanitizeDate(dateRaw, "")
        : undefined;
      const prev = lastBuy.get(key);
      if (!prev || (date && (!prev.date || date >= prev.date))) {
        lastBuy.set(key, {
          unitCost: unitCost > 0 ? unitCost : prev?.unitCost ?? 0,
          ...(supplier ? { supplier } : prev?.supplier ? { supplier: prev.supplier } : {}),
          ...(date ? { date } : {}),
        });
      }
    }
  }

  // --- Items from STOKI_DEF ---
  const items: WarehouseItem[] = [];
  const itemIdByArticle = new Map<string, string>();
  let skippedDupArticles = 0;
  for (const row of defRows) {
    const grupa = (row.GRUPA || "").trim();
    const stoka = (row.STOKA || "").trim();
    if (!stoka) continue;
    const key = articleKey(grupa, stoka);
    if (itemIdByArticle.has(key)) {
      skippedDupArticles++;
      continue;
    }
    const id = uuidFromKey(`item:${key}`);
    itemIdByArticle.set(key, id);
    const code = (row.CODE || "").trim();
    const barcode = (row.BARCODE || "").trim();
    const unit = (row.RAZFAS1 || "").trim() || "pcs";
    const groupId = grupa ? groupIdByName.get(grupa) : undefined;
    const minQty = num(row.MIN_KOLICH);
    const maxQty = num(row.MAX_KOLICH);
    const tracksSerial = (row.IS_SER_NO || "").toUpperCase() === "Y";
    const supplier = (row.DOSTAW || "").trim();
    const item: WarehouseItem = {
      id,
      name: stoka,
      unit,
      defaultMaterialKind: "materials",
      createdAt: sanitizeTimestamp(
        row.DATE_CREATED,
        new Date().toISOString(),
      ),
      tracksSerial,
    };
    if (code) item.sku = code;
    if (barcode) item.barcode = barcode;
    if (groupId) item.groupId = groupId;
    if (minQty > 0) item.minQty = minQty;
    if (maxQty > 0) item.maxQty = maxQty;
    // stash supplier hint on notes via lastBuy later on lots
    void supplier;
    items.push(item);
  }
  if (skippedDupArticles > 0) {
    warnings.push(
      `Skipped ${skippedDupArticles} duplicate STOKI_DEF articles (same group+name)`,
    );
  }

  // --- Balances + opening lots from STOKI qty>0 ---
  const lots: WarehouseLot[] = [];
  const balances: WarehouseBalance[] = [];
  const lotById = new Map<string, WarehouseLot>();
  const balById = new Map<string, WarehouseBalance>();
  let skippedZero = 0;
  let skippedInactiveWh = 0;
  let parkedSystem = 0;
  const bySite: Record<WarehouseSite, number> = { ELX: 0, MH: 0, Van: 0 };

  for (const row of stokiRows) {
    const qty = num(row.KOLICH);
    if (!(qty > 0)) {
      skippedZero++;
      continue;
    }
    const sklad = (row.SKLAD || "").trim();
    const mapped = mapSkladToLocation(sklad);
    if (mapped.skip) {
      skippedInactiveWh++;
      continue;
    }
    const key = articleKey(row.GRUPA || "", row.STOKA || "");
    let itemId = itemIdByArticle.get(key);
    if (!itemId) {
      // Create stub item from stock row
      itemId = uuidFromKey(`item:${key}`);
      itemIdByArticle.set(key, itemId);
      const stoka = (row.STOKA || "").trim() || key;
      const grupa = (row.GRUPA || "").trim();
      items.push({
        id: itemId,
        name: stoka,
        unit: "pcs",
        defaultMaterialKind: "materials",
        createdAt: new Date().toISOString(),
        ...(grupa && groupIdByName.has(grupa)
          ? { groupId: groupIdByName.get(grupa) }
          : {}),
      });
      warnings.push(`Created stub item for stock without STOKI_DEF: ${stoka}`);
    }

    const buy = lastBuy.get(key);
    const unitCost =
      num(row.CENA_KUP) > 0
        ? num(row.CENA_KUP)
        : buy?.unitCost && buy.unitCost > 0
          ? buy.unitCost
          : 0;
    const unitEx = Math.round((unitCost / 1.2) * 100) / 100;
    const loc = cloneLocation(mapped.location);
    const lotId = uuidFromKey(`lot:${sklad}:${key}`);
    const defRow = defRows.find(
      (d) => articleKey(d.GRUPA || "", d.STOKA || "") === key,
    );
    const supplier =
      buy?.supplier ||
      (defRow?.DOSTAW || "").trim() ||
      undefined;

    const existingLot = lotById.get(lotId);
    if (existingLot) {
      existingLot.qtyReceived =
        Math.round((existingLot.qtyReceived + qty) * 10000) / 10000;
    } else {
      const lot: WarehouseLot = {
        id: lotId,
        itemId,
        qtyReceived: qty,
        unitCostIncVat: unitCost,
        unitCostExVat: unitEx > 0 ? unitEx : unitCost,
        receivedAt: sanitizeDate(buy?.date, asOf),
        purchaseProjectId: holdingId,
        category: "materials",
        label: "Opening (MoneyWorks)",
        sourceSklad: sklad,
        createdAt: new Date().toISOString(),
        ...(supplier ? { supplier } : {}),
      };
      lotById.set(lotId, lot);
      lots.push(lot);
    }

    const balId = uuidFromKey(`bal:${lotId}:${loc.site}:${loc.slot}`);
    const existingBal = balById.get(balId);
    if (existingBal) {
      existingBal.qty = Math.round((existingBal.qty + qty) * 10000) / 10000;
    } else {
      const bal: WarehouseBalance = {
        id: balId,
        lotId,
        location: loc,
        qty,
        sourceSklad: sklad,
      };
      balById.set(balId, bal);
      balances.push(bal);
      bySite[loc.site] += 1;
      if (mapped.parkedSystem) parkedSystem++;
    }
  }

  // --- Serials qty>0 ---
  const serials: WarehouseSerial[] = [];
  const serialById = new Map<string, WarehouseSerial>();
  for (const row of serRows) {
    const qty = num(row.KOLICH);
    if (!(qty > 0)) continue;
    const serial = (row.SER_NO || "").trim();
    if (!serial) continue;
    const sklad = (row.SKLAD || "").trim();
    const mapped = mapSkladToLocation(sklad);
    if (mapped.skip) continue;
    const key = articleKey(row.GRUPA || "", row.STOKA || "");
    const itemId = itemIdByArticle.get(key);
    if (!itemId) continue;
    const lotId = uuidFromKey(`lot:${sklad}:${key}`);
    const hasLot = lotById.has(lotId);
    const serId = uuidFromKey(`ser:${itemId}:${serial}:${sklad}`);
    if (serialById.has(serId)) continue;
    const s: WarehouseSerial = {
      id: serId,
      itemId,
      ...(hasLot ? { lotId } : {}),
      serial,
      location: cloneLocation(mapped.location),
      qty,
      status: "in_stock",
      sourceSklad: sklad,
      createdAt: new Date().toISOString(),
    };
    serialById.set(serId, s);
    serials.push(s);
  }

  const safeGroups = dedupeById(groups, "group", warnings);
  const groupIdSet = new Set(safeGroups.map((g) => g.id));
  const safeItems = dedupeById(items, "item", warnings).map((item) => {
    if (item.groupId && !groupIdSet.has(item.groupId)) {
      const { groupId: _drop, ...rest } = item;
      return rest;
    }
    return item;
  });
  const safeLots = dedupeById(lots, "lot", warnings);
  const safeBalances = dedupeById(balances, "balance", warnings);
  const safeSerials = dedupeById(serials, "serial", warnings);

  return {
    state: {
      items: safeItems,
      lots: safeLots,
      balances: safeBalances,
      movements: [],
      groups: safeGroups,
      serials: safeSerials,
    },
    stats: {
      groups: safeGroups.length,
      items: safeItems.length,
      lots: safeLots.length,
      balances: safeBalances.length,
      serials: safeSerials.length,
      skippedZero,
      skippedInactiveWh,
      parkedSystem,
      bySite,
    },
    warnings: warnings.slice(0, 50),
  };
}

export function emptyImportHoldingFallback(): WarehouseState {
  return emptyWarehouseState();
}

export type { WarehouseSlot };
