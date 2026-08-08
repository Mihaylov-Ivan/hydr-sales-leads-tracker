"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  WarehouseLocation,
  WarehouseMaterialKind,
  WarehouseSite,
  WarehouseSlot,
  WAREHOUSE_MATERIAL_KINDS,
  WAREHOUSE_MATERIAL_KIND_LABELS,
  WAREHOUSE_SITES,
  WAREHOUSE_SITE_LABELS,
  WAREHOUSE_SLOT_LABELS,
  amountExFromInc,
  amountIncFromEx,
  todayDate,
} from "@/lib/types";
import {
  locationLabel,
  locationsEqual,
  lotQtyOnHand,
  openLotsCount,
  spentAgainstExpense,
  stockValueAtSlot,
  totalStockValue,
} from "@/lib/warehouse";
import {
  buildProjectWarehouseMetrics,
  projectsWithWarehouseActivity,
} from "@/lib/warehouse-metrics";
import {
  compareBomToProject,
  isUserOwnedBomSourceKey,
  listBomsWithLines,
} from "@/lib/warehouse-bom";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import CatalogItemSearchSelect from "@/components/CatalogItemSearchSelect";
import type { WarehouseBomLineInput } from "@/lib/types";

const inputCls =
  "w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none focus:border-teal-accent";
const labelCls =
  "mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-muted";
const filterCls =
  "w-full min-w-0 rounded border border-line bg-white px-1.5 py-1 text-[10px] text-ink outline-none focus:border-teal-accent";

const ALL_SLOTS: WarehouseSlot[] = ["project", "spare", "buffer"];
const NO_PROJECT = "__none__";
const NO_GROUP = "__none__";
const EXPENSE_FILTER_OPTIONS = [
  { id: "linked", label: "Linked" },
  { id: "unlinked", label: "Unlinked" },
] as const;
const EXPENSE_FILTER_IDS = EXPENSE_FILTER_OPTIONS.map((o) => o.id);

function toggleInSet(
  prev: Set<string> | null,
  allIds: string[],
  id: string,
): Set<string> {
  const next = new Set(prev ?? allIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatQty(n: number): string {
  if (!(n > 0)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function roundMoneyDisplay(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type StockRow = {
  balanceId: string;
  lotId: string;
  itemId: string;
  itemName: string;
  sku?: string;
  unit: string;
  location: WarehouseLocation;
  site: WarehouseSite;
  slot: WarehouseSlot;
  projectId?: string;
  projectName?: string;
  locationLabel: string;
  qty: number;
  unitCost: number;
  lineValue: number;
  receivedAt: string;
  expenseId?: string;
  label?: string;
  sourceSklad?: string;
  groupName?: string;
  category: string;
  supplier?: string;
};

type DestSlot = WarehouseSlot;

type BomDraftLine = {
  key: string;
  componentName: string;
  componentGroup: string;
  componentItemId: string;
  qtyPerUnit: string;
  unitCost: string;
};

function emptyBomDraftLine(): BomDraftLine {
  return {
    key: crypto.randomUUID(),
    componentName: "",
    componentGroup: "",
    componentItemId: "",
    qtyPerUnit: "1",
    unitCost: "",
  };
}

export default function WarehousePage() {
  const {
    projects,
    ready,
    warehouse,
    receiveStock,
    transferStock,
    consumeStock,
    adjustStock,
    updateWarehouseLot,
    deleteWarehouseLot,
    upsertWarehouseItem,
    ensureWarehouseHoldingProject,
    importMoneyWorksWarehouse,
    applySystemSkladMapping,
    linkProjectWarehouseExpenses,
    saveWarehouseBom,
    duplicateWarehouseBom,
    deleteWarehouseBom,
  } = useProjects();

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [filterSites, setFilterSites] = useState<Set<string>>(
    () => new Set(WAREHOUSE_SITES),
  );
  const [filterSlots, setFilterSlots] = useState<Set<string>>(
    () => new Set(ALL_SLOTS),
  );
  const [filterProjectIds, setFilterProjectIds] = useState<Set<string> | null>(
    null,
  );
  const [filterReceivedFrom, setFilterReceivedFrom] = useState("");
  const [filterReceivedTo, setFilterReceivedTo] = useState("");
  const [filterLot, setFilterLot] = useState("");
  const [filterExpenseIds, setFilterExpenseIds] = useState<Set<string> | null>(
    null,
  );
  const [filterGroupIds, setFilterGroupIds] = useState<Set<string> | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [linking, setLinking] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Receive form
  const [recvMode, setRecvMode] = useState<"existing" | "new">("new");
  const [recvItemId, setRecvItemId] = useState("");
  const [recvName, setRecvName] = useState("");
  const [recvSku, setRecvSku] = useState("");
  const [recvUnit, setRecvUnit] = useState("pcs");
  const [recvGroupId, setRecvGroupId] = useState("");
  const [recvQty, setRecvQty] = useState("");
  const [recvEx, setRecvEx] = useState("");
  const [recvInc, setRecvInc] = useState("");
  const [recvDate, setRecvDate] = useState(todayDate());
  const [recvKind, setRecvKind] =
    useState<WarehouseMaterialKind>("materials");
  const [recvSite, setRecvSite] = useState<WarehouseSite>("ELX");
  const [recvDestSlot, setRecvDestSlot] = useState<DestSlot>("project");
  const [recvProjectId, setRecvProjectId] = useState("");
  const [recvExpenseMode, setRecvExpenseMode] = useState<"create" | "link">(
    "create",
  );
  const [recvLinkExpenseId, setRecvLinkExpenseId] = useState("");
  const [recvLabel, setRecvLabel] = useState("");
  const [recvSupplier, setRecvSupplier] = useState("");
  const [recvNotes, setRecvNotes] = useState("");
  const [recvError, setRecvError] = useState<string | null>(null);

  // Move / consume panel
  const [moveQty, setMoveQty] = useState("");
  const [moveSite, setMoveSite] = useState<WarehouseSite>("ELX");
  const [moveDestSlot, setMoveDestSlot] = useState<DestSlot>("spare");
  const [moveProjectId, setMoveProjectId] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [activeBalanceId, setActiveBalanceId] = useState<string | null>(null);
  const [editingLot, setEditingLot] = useState(false);
  const [editBalanceId, setEditBalanceId] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEx, setEditEx] = useState("");
  const [editInc, setEditInc] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editKind, setEditKind] =
    useState<WarehouseMaterialKind>("materials");
  const [editSite, setEditSite] = useState<WarehouseSite>("ELX");
  const [editSlot, setEditSlot] = useState<WarehouseSlot>("spare");
  const [editProjectId, setEditProjectId] = useState("");
  const [editPurchaseProjectId, setEditPurchaseProjectId] = useState("");
  const [editExpenseId, setEditExpenseId] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [analysisProjectId, setAnalysisProjectId] = useState("");
  const [analysisBomId, setAnalysisBomId] = useState("");
  const [analysisView, setAnalysisView] = useState<"project" | "bom">(
    "project",
  );
  const [bomEditorOpen, setBomEditorOpen] = useState(false);
  const [bomEditingId, setBomEditingId] = useState<string | null>(null);
  const [bomDraftName, setBomDraftName] = useState("");
  const [bomDraftFamily, setBomDraftFamily] = useState("");
  const [bomDraftGroup, setBomDraftGroup] = useState("");
  const [bomDraftOutputItemId, setBomDraftOutputItemId] = useState("");
  const [bomDraftNotes, setBomDraftNotes] = useState("");
  const [bomDraftLines, setBomDraftLines] = useState<BomDraftLine[]>([
    emptyBomDraftLine(),
  ]);
  const [bomEditError, setBomEditError] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<"stock" | "analysis">("stock");

  useEffect(() => {
    if (ready) ensureWarehouseHoldingProject();
  }, [ready, ensureWarehouseHoldingProject]);

  const salesProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => !p.isWarehouseHolding && p.stage !== "cancelled")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const holdingProject = useMemo(
    () => projects.find((p) => p.isWarehouseHolding) ?? null,
    [projects],
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const itemById = useMemo(() => {
    const m = new Map(warehouse.items.map((i) => [i.id, i]));
    return m;
  }, [warehouse.items]);

  const lotById = useMemo(() => {
    const m = new Map(warehouse.lots.map((l) => [l.id, l]));
    return m;
  }, [warehouse.lots]);

  const kpis = useMemo(() => {
    const total = totalStockValue(warehouse.lots, warehouse.balances);
    const spares = stockValueAtSlot(
      warehouse.lots,
      warehouse.balances,
      "spare",
    );
    const buffer = stockValueAtSlot(
      warehouse.lots,
      warehouse.balances,
      "buffer",
    );
    const elx = stockValueAtSlot(warehouse.lots, warehouse.balances, "spare", {
      site: "ELX",
    }) + stockValueAtSlot(warehouse.lots, warehouse.balances, "buffer", {
      site: "ELX",
    }) + stockValueAtSlot(warehouse.lots, warehouse.balances, "project", {
      site: "ELX",
    });
    const open = openLotsCount(warehouse.lots, warehouse.balances);
    return { total, spares, buffer, elx, open };
  }, [warehouse.lots, warehouse.balances]);

  const groupById = useMemo(() => {
    const m = new Map(warehouse.groups.map((g) => [g.id, g]));
    return m;
  }, [warehouse.groups]);

  /** Roots then children — for group <select> options */
  const groupsForSelect = useMemo(() => {
    const roots = warehouse.groups
      .filter((g) => !g.parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "bg"));
    const byParent = new Map<string, typeof warehouse.groups>();
    for (const g of warehouse.groups) {
      if (!g.parentId) continue;
      if (!byParent.has(g.parentId)) byParent.set(g.parentId, []);
      byParent.get(g.parentId)!.push(g);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "bg"));
    }
    const out: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      out.push({ id: root.id, label: root.name });
      seen.add(root.id);
      for (const ch of byParent.get(root.id) ?? []) {
        out.push({ id: ch.id, label: `↳ ${ch.name}` });
        seen.add(ch.id);
      }
    }
    for (const g of warehouse.groups) {
      if (seen.has(g.id)) continue;
      out.push({ id: g.id, label: g.name });
    }
    return out;
  }, [warehouse.groups]);

  const analysisProjects = useMemo(
    () =>
      projectsWithWarehouseActivity(
        projects,
        warehouse,
        warehouse.holdingProjectId,
      ),
    [projects, warehouse],
  );

  useEffect(() => {
    if (
      analysisProjectId &&
      analysisProjects.some((p) => p.id === analysisProjectId)
    ) {
      return;
    }
    setAnalysisProjectId(analysisProjects[0]?.id ?? "");
  }, [analysisProjects, analysisProjectId]);

  const projectMetrics = useMemo(() => {
    if (!analysisProjectId) return null;
    const p = projects.find((x) => x.id === analysisProjectId);
    if (!p) return null;
    return buildProjectWarehouseMetrics(p.id, p.name, warehouse);
  }, [analysisProjectId, projects, warehouse]);

  const bomCatalog = useMemo(
    () => listBomsWithLines(warehouse),
    [warehouse],
  );

  useEffect(() => {
    if (
      analysisBomId &&
      bomCatalog.some((b) => b.id === analysisBomId)
    ) {
      return;
    }
    setAnalysisBomId(bomCatalog[0]?.id ?? "");
  }, [bomCatalog, analysisBomId]);

  const selectedBom = useMemo(
    () => bomCatalog.find((b) => b.id === analysisBomId) ?? null,
    [bomCatalog, analysisBomId],
  );

  const bomVsProject = useMemo(() => {
    if (!selectedBom) return [];
    return compareBomToProject(selectedBom, projectMetrics);
  }, [selectedBom, projectMetrics]);

  function openNewBomEditor() {
    setBomEditingId(null);
    setBomDraftName("");
    setBomDraftFamily("");
    setBomDraftGroup("");
    setBomDraftOutputItemId("");
    setBomDraftNotes("");
    setBomDraftLines([emptyBomDraftLine()]);
    setBomEditError(null);
    setBomEditorOpen(true);
    setAnalysisView("bom");
  }

  function openEditBomEditor(bomId: string) {
    const bom = bomCatalog.find((b) => b.id === bomId);
    if (!bom) return;
    setBomEditingId(bom.id);
    setBomDraftName(bom.name);
    setBomDraftFamily(bom.productFamily ?? "");
    setBomDraftGroup(bom.outputGroup ?? "");
    setBomDraftOutputItemId(bom.outputItemId ?? "");
    setBomDraftNotes(bom.notes ?? "");
    setBomDraftLines(
      bom.lines.length > 0
        ? bom.lines.map((l) => ({
            key: l.id,
            componentName: l.componentName,
            componentGroup: l.componentGroup ?? "",
            componentItemId: l.componentItemId ?? "",
            qtyPerUnit: String(l.qtyPerUnit),
            unitCost: l.unitCost != null ? String(l.unitCost) : "",
          }))
        : [emptyBomDraftLine()],
    );
    setBomEditError(null);
    setBomEditorOpen(true);
    setAnalysisView("bom");
  }

  function closeBomEditor() {
    setBomEditorOpen(false);
    setBomEditError(null);
  }

  function saveBomEditor() {
    const lines: WarehouseBomLineInput[] = [];
    for (const row of bomDraftLines) {
      const name = row.componentName.trim();
      if (!name && !row.qtyPerUnit.trim() && !row.unitCost.trim()) continue;
      const qty = Number(String(row.qtyPerUnit).replace(",", "."));
      const costRaw = row.unitCost.trim();
      const unitCost = costRaw
        ? Number(String(costRaw).replace(",", "."))
        : undefined;
      lines.push({
        componentName: name,
        ...(row.componentGroup.trim()
          ? { componentGroup: row.componentGroup.trim() }
          : {}),
        ...(row.componentItemId
          ? { componentItemId: row.componentItemId }
          : {}),
        qtyPerUnit: qty,
        ...(unitCost != null && Number.isFinite(unitCost)
          ? { unitCost }
          : {}),
      });
    }
    const res = saveWarehouseBom({
      ...(bomEditingId ? { id: bomEditingId } : {}),
      name: bomDraftName,
      ...(bomDraftFamily.trim()
        ? { productFamily: bomDraftFamily.trim() }
        : {}),
      ...(bomDraftGroup.trim() ? { outputGroup: bomDraftGroup.trim() } : {}),
      ...(bomDraftOutputItemId
        ? { outputItemId: bomDraftOutputItemId }
        : {}),
      ...(bomDraftNotes.trim() ? { notes: bomDraftNotes.trim() } : {}),
      lines,
    });
    if (!res.ok) {
      setBomEditError(res.error);
      return;
    }
    setAnalysisBomId(res.bomId);
    closeBomEditor();
  }

  const stockRows = useMemo(() => {
    const rows: StockRow[] = [];
    for (const b of warehouse.balances) {
      if (b.qty <= 0) continue;
      const lot = lotById.get(b.lotId);
      const item = lot ? itemById.get(lot.itemId) : undefined;
      if (!lot || !item) continue;
      const projectId =
        b.location.slot === "project" ? b.location.projectId : undefined;
      const projectName = projectId ? nameById.get(projectId) : undefined;
      const groupName = item.groupId
        ? groupById.get(item.groupId)?.name
        : undefined;
      const sourceSklad = b.sourceSklad ?? lot.sourceSklad;
      rows.push({
        balanceId: b.id,
        lotId: lot.id,
        itemId: item.id,
        itemName: item.name,
        ...(item.sku ? { sku: item.sku } : {}),
        unit: item.unit,
        location: b.location,
        site: b.location.site,
        slot: b.location.slot,
        ...(projectId ? { projectId } : {}),
        ...(projectName ? { projectName } : {}),
        locationLabel: locationLabel(b.location, (id) => nameById.get(id)),
        qty: b.qty,
        unitCost: lot.unitCostIncVat,
        lineValue: b.qty * lot.unitCostIncVat,
        receivedAt: lot.receivedAt,
        ...(lot.expenseId ? { expenseId: lot.expenseId } : {}),
        ...(lot.label ? { label: lot.label } : {}),
        ...(sourceSklad ? { sourceSklad } : {}),
        ...(groupName ? { groupName } : {}),
        category: lot.category,
        ...(lot.supplier ? { supplier: lot.supplier } : {}),
      });
    }

    const q = filterQ.trim().toLowerCase();
    const itemQ = filterItem.trim().toLowerCase();
    const lotQ = filterLot.trim().toLowerCase();
    let filtered = rows;

    if (filterSites.size > 0 && filterSites.size < WAREHOUSE_SITES.length) {
      filtered = filtered.filter((r) => filterSites.has(r.site));
    } else if (filterSites.size === 0) {
      filtered = [];
    }

    if (filterSlots.size > 0 && filterSlots.size < ALL_SLOTS.length) {
      filtered = filtered.filter((r) => filterSlots.has(r.slot));
    } else if (filterSlots.size === 0) {
      filtered = [];
    }

    if (filterProjectIds !== null) {
      if (filterProjectIds.size === 0) {
        filtered = [];
      } else {
        filtered = filtered.filter((r) => {
          const key = r.projectId ?? NO_PROJECT;
          return filterProjectIds.has(key);
        });
      }
    }

    if (filterGroupIds !== null) {
      if (filterGroupIds.size === 0) {
        filtered = [];
      } else {
        filtered = filtered.filter((r) => {
          const item = itemById.get(r.itemId);
          const key = item?.groupId ?? NO_GROUP;
          return filterGroupIds.has(key);
        });
      }
    }

    if (filterReceivedFrom) {
      filtered = filtered.filter((r) => r.receivedAt >= filterReceivedFrom);
    }
    if (filterReceivedTo) {
      filtered = filtered.filter((r) => r.receivedAt <= filterReceivedTo);
    }

    if (filterExpenseIds !== null) {
      if (filterExpenseIds.size === 0) {
        filtered = [];
      } else {
        filtered = filtered.filter((r) => {
          const linked = Boolean(r.expenseId);
          if (linked) return filterExpenseIds.has("linked");
          return filterExpenseIds.has("unlinked");
        });
      }
    }

    if (itemQ) {
      filtered = filtered.filter((r) =>
        [r.itemName, r.sku, r.label, r.groupName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(itemQ),
      );
    }
    if (lotQ) {
      filtered = filtered.filter((r) => r.lotId.toLowerCase().includes(lotQ));
    }
    if (q) {
      filtered = filtered.filter((r) =>
        [
          r.itemName,
          r.sku,
          r.label,
          r.locationLabel,
          r.site,
          r.slot,
          r.projectName,
          r.lotId,
          r.groupName,
          r.sourceSklad,
          r.supplier,
          r.category,
          r.expenseId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return filtered.sort((a, b) => {
      const n = a.itemName.localeCompare(b.itemName);
      if (n !== 0) return n;
      const s = a.site.localeCompare(b.site);
      if (s !== 0) return s;
      const sl = a.slot.localeCompare(b.slot);
      if (sl !== 0) return sl;
      return (a.projectName ?? "").localeCompare(b.projectName ?? "");
    });
  }, [
    warehouse.balances,
    lotById,
    itemById,
    nameById,
    groupById,
    filterQ,
    filterItem,
    filterSites,
    filterSlots,
    filterProjectIds,
    filterGroupIds,
    filterReceivedFrom,
    filterReceivedTo,
    filterLot,
    filterExpenseIds,
  ]);

  const stockProjectOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const b of warehouse.balances) {
      if (b.qty <= 0) continue;
      if (b.location.slot === "project" && b.location.projectId) {
        ids.add(b.location.projectId);
      }
    }
    return [...ids]
      .map((id) => ({ id, name: nameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouse.balances, nameById]);

  const projectFilterOptions = useMemo(
    () => [
      { id: NO_PROJECT, label: "No project (spare/buffer)" },
      ...stockProjectOptions.map((p) => ({ id: p.id, label: p.name })),
    ],
    [stockProjectOptions],
  );

  const projectFilterAllIds = useMemo(
    () => projectFilterOptions.map((o) => o.id),
    [projectFilterOptions],
  );

  const groupFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const b of warehouse.balances) {
      if (b.qty <= 0) continue;
      const lot = lotById.get(b.lotId);
      const item = lot ? itemById.get(lot.itemId) : undefined;
      if (!item) continue;
      if (item.groupId) ids.add(item.groupId);
    }
    const opts = [...ids]
      .map((id) => ({
        id,
        label: groupById.get(id)?.name ?? id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    opts.unshift({ id: NO_GROUP, label: "No group" });
    return opts;
  }, [warehouse.balances, lotById, itemById, groupById]);

  const groupFilterAllIds = useMemo(
    () => groupFilterOptions.map((o) => o.id),
    [groupFilterOptions],
  );

  const selectedProjectIds =
    filterProjectIds ?? new Set(projectFilterAllIds);
  const selectedGroupIds = filterGroupIds ?? new Set(groupFilterAllIds);
  const selectedExpenseIds =
    filterExpenseIds ?? new Set(EXPENSE_FILTER_IDS);

  const filteredStockValue = useMemo(
    () =>
      roundMoneyDisplay(
        stockRows.reduce((sum, r) => sum + r.lineValue, 0),
      ),
    [stockRows],
  );

  const filtersActive = useMemo(() => {
    return (
      filterQ.trim() !== "" ||
      filterItem.trim() !== "" ||
      filterLot.trim() !== "" ||
      filterReceivedFrom !== "" ||
      filterReceivedTo !== "" ||
      filterSites.size !== WAREHOUSE_SITES.length ||
      filterSlots.size !== ALL_SLOTS.length ||
      filterProjectIds !== null ||
      filterGroupIds !== null ||
      filterExpenseIds !== null
    );
  }, [
    filterQ,
    filterItem,
    filterLot,
    filterReceivedFrom,
    filterReceivedTo,
    filterSites,
    filterSlots,
    filterProjectIds,
    filterGroupIds,
    filterExpenseIds,
  ]);

  function clearStockFilters() {
    setFilterQ("");
    setFilterItem("");
    setFilterLot("");
    setFilterReceivedFrom("");
    setFilterReceivedTo("");
    setFilterSites(new Set(WAREHOUSE_SITES));
    setFilterSlots(new Set(ALL_SLOTS));
    setFilterProjectIds(null);
    setFilterGroupIds(null);
    setFilterExpenseIds(null);
  }

  function normalizeFilterSet(
    next: Set<string>,
    allIds: string[],
  ): Set<string> | null {
    if (
      allIds.length > 0 &&
      next.size === allIds.length &&
      allIds.every((id) => next.has(id))
    ) {
      return null;
    }
    return next;
  }

  const linkableExpenses = useMemo(() => {
    const destProjectId =
      recvDestSlot === "project"
        ? recvProjectId
        : holdingProject?.id ?? warehouse.holdingProjectId ?? "";
    if (!destProjectId) return [];
    const p = projects.find((x) => x.id === destProjectId);
    if (!p) return [];
    return (p.financials.expenseSchedule ?? [])
      .filter((e) => !e.warehouseLotId && !e.actualDate)
      .map((e) => {
        const spent = spentAgainstExpense(warehouse.lots, e.id);
        return {
          id: e.id,
          label: e.label || e.id.slice(0, 8),
          amount: e.amount,
          dueDate: e.dueDate,
          spent,
        };
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [
    recvDestSlot,
    recvProjectId,
    holdingProject,
    warehouse.holdingProjectId,
    warehouse.lots,
    projects,
  ]);

  const selectedLotMovements = useMemo(() => {
    if (!selectedLotId) return [];
    return warehouse.movements
      .filter((m) => m.lotId === selectedLotId)
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [warehouse.movements, selectedLotId]);

  const selectedLot = selectedLotId
    ? lotById.get(selectedLotId) ?? null
    : null;

  const selectedLotItem = selectedLot
    ? itemById.get(selectedLot.itemId)
    : undefined;

  const catalogItemsSorted = useMemo(
    () =>
      [...warehouse.items].sort((a, b) => a.name.localeCompare(b.name)),
    [warehouse.items],
  );

  const editExpenseOptions = useMemo(() => {
    const projectId =
      editSlot === "project" && editProjectId
        ? editProjectId
        : editPurchaseProjectId;
    if (!projectId) return [];
    const p = projects.find((x) => x.id === projectId);
    if (!p) return [];
    return (p.financials.expenseSchedule ?? [])
      .filter((e) => !e.warehouseLotId)
      .map((e) => ({
        id: e.id,
        label: `${e.label || e.id.slice(0, 8)} · ${e.dueDate} · ${formatMoney(e.amount)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    editSlot,
    editProjectId,
    editPurchaseProjectId,
    projects,
  ]);

  const allProjectsForEdit = useMemo(
    () =>
      [...projects]
        .filter((p) => p.stage !== "cancelled")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  function openLotEditor(lotId: string, balanceId?: string) {
    const lot = lotById.get(lotId);
    if (!lot) return;
    const bal =
      (balanceId
        ? warehouse.balances.find((b) => b.id === balanceId && b.lotId === lotId)
        : undefined) ??
      warehouse.balances.find((b) => b.lotId === lotId && b.qty > 0) ??
      warehouse.balances.find((b) => b.lotId === lotId);
    setSelectedLotId(lotId);
    setEditingLot(true);
    setEditError(null);
    setEditBalanceId(bal?.id ?? null);
    setEditItemId(lot.itemId);
    setEditGroupId(itemById.get(lot.itemId)?.groupId ?? "");
    setEditDate(lot.receivedAt);
    setEditInc(String(lot.unitCostIncVat));
    setEditEx(String(lot.unitCostExVat));
    setEditLabel(lot.label ?? "");
    setEditSupplier(lot.supplier ?? "");
    setEditNotes(lot.notes ?? "");
    setEditPurchaseProjectId(lot.purchaseProjectId);
    setEditExpenseId(lot.expenseId ?? "");
    setEditQty(bal ? String(bal.qty) : "");
    if (bal) {
      setEditSite(bal.location.site);
      setEditSlot(bal.location.slot);
      setEditProjectId(
        bal.location.slot === "project" ? bal.location.projectId ?? "" : "",
      );
    } else {
      setEditSite("ELX");
      setEditSlot("spare");
      setEditProjectId("");
    }
    const kind: WarehouseMaterialKind =
      lot.category === "installation"
        ? "installation"
        : lot.category === "maintenance"
          ? "maintenance"
          : "materials";
    setEditKind(kind);
  }

  function submitLotEdit() {
    if (!selectedLotId) return;
    setEditError(null);
    const unitInc = parseNum(editInc);
    const unitEx = parseNum(editEx);
    if (unitInc == null || unitInc < 0) {
      setEditError("Enter a valid unit cost (inc VAT)");
      return;
    }
    if (!editDate.trim()) {
      setEditError("Enter a received date");
      return;
    }
    if (!editItemId) {
      setEditError("Select a catalog item");
      return;
    }
    if (!editPurchaseProjectId) {
      setEditError("Select a purchase project");
      return;
    }
    if (editSlot === "project" && !editProjectId) {
      setEditError("Select a project for Project slot");
      return;
    }

    const bal = editBalanceId
      ? warehouse.balances.find((b) => b.id === editBalanceId)
      : undefined;
    const toLoc: WarehouseLocation =
      editSlot === "project"
        ? { site: editSite, slot: "project", projectId: editProjectId }
        : { site: editSite, slot: editSlot };

    if (bal && bal.qty > 0 && !locationsEqual(bal.location, toLoc)) {
      const moved = transferStock({
        lotId: selectedLotId,
        qty: bal.qty,
        from: bal.location,
        to: toLoc,
        note: "Lot edit — location change",
      });
      if (!moved.ok) {
        setEditError(moved.error);
        return;
      }
    }

    const qty = parseNum(editQty);
    if (qty != null && qty >= 0) {
      const adjusted = adjustStock({
        lotId: selectedLotId,
        location: toLoc,
        newQty: qty,
        note: "Lot edit — qty change",
      });
      if (!adjusted.ok) {
        setEditError(adjusted.error);
        return;
      }
    }

    const catalogItem = itemById.get(editItemId);
    if (catalogItem) {
      upsertWarehouseItem({
        id: editItemId,
        name: catalogItem.name,
        sku: catalogItem.sku,
        unit: catalogItem.unit,
        defaultMaterialKind: editKind,
        groupId: editGroupId || null,
      });
    }

    const result = updateWarehouseLot({
      lotId: selectedLotId,
      itemId: editItemId,
      receivedAt: editDate,
      unitCostIncVat: unitInc,
      unitCostExVat: unitEx,
      label: editLabel.trim() || null,
      supplier: editSupplier.trim() || null,
      notes: editNotes.trim() || null,
      materialKind: editKind,
      purchaseProjectId: editPurchaseProjectId,
      expenseId: editExpenseId.trim() || null,
    });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditingLot(false);
  }

  function confirmDeleteLot(lotId: string) {
    const lot = lotById.get(lotId);
    const name = lot
      ? itemById.get(lot.itemId)?.name ?? lot.label ?? lotId.slice(0, 8)
      : lotId.slice(0, 8);
    if (
      !window.confirm(
        `Delete warehouse lot “${name}”? This removes its stock and linked expense rows.`,
      )
    ) {
      return;
    }
    const result = deleteWarehouseLot(lotId);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setSelectedLotId(null);
    setEditingLot(false);
    setActiveBalanceId(null);
    setActionError(null);
  }

  const activeRow = stockRows.find((r) => r.balanceId === activeBalanceId);

  function onRecvExChange(raw: string) {
    setRecvEx(raw);
    const n = parseNum(raw);
    if (n == null) {
      setRecvInc("");
      return;
    }
    setRecvInc(String(amountIncFromEx(n)));
  }

  function onRecvIncChange(raw: string) {
    setRecvInc(raw);
    const n = parseNum(raw);
    if (n == null) {
      setRecvEx("");
      return;
    }
    setRecvEx(String(amountExFromInc(n)));
  }

  function buildDestination(
    site: WarehouseSite,
    slot: DestSlot,
    projectId: string,
  ): WarehouseLocation | null {
    if (slot === "spare") return { site, slot: "spare" };
    if (slot === "buffer") return { site, slot: "buffer" };
    if (!projectId) return null;
    return { site, slot: "project", projectId };
  }

  function submitReceive() {
    setRecvError(null);
    const qty = parseNum(recvQty);
    const unitInc = parseNum(recvInc);
    const unitEx = parseNum(recvEx);
    if (qty == null || qty <= 0) {
      setRecvError("Enter a positive quantity");
      return;
    }
    if (unitInc == null || unitInc < 0) {
      setRecvError("Enter unit cost (inc VAT)");
      return;
    }
    const destination = buildDestination(recvSite, recvDestSlot, recvProjectId);
    if (!destination) {
      setRecvError("Select a destination project");
      return;
    }
    if (recvMode === "existing" && !recvItemId) {
      setRecvError("Select a catalog item");
      return;
    }
    if (recvMode === "new" && !recvName.trim()) {
      setRecvError("Enter an item name");
      return;
    }
    if (recvExpenseMode === "link" && !recvLinkExpenseId) {
      setRecvError("Select an expense to link");
      return;
    }

    const destProjectId =
      destination.slot === "project"
        ? destination.projectId!
        : holdingProject?.id ?? warehouse.holdingProjectId ?? "";

    const result = receiveStock({
      ...(recvMode === "existing"
        ? {
            itemId: recvItemId,
            groupId: recvGroupId || null,
          }
        : {
            newItem: {
              name: recvName.trim(),
              ...(recvSku.trim() ? { sku: recvSku.trim() } : {}),
              unit: recvUnit.trim() || "pcs",
              defaultMaterialKind: recvKind,
              ...(recvGroupId ? { groupId: recvGroupId } : {}),
            },
          }),
      qty,
      unitCostIncVat: unitInc,
      ...(unitEx != null ? { unitCostExVat: unitEx } : {}),
      receivedAt: recvDate,
      materialKind: recvKind,
      destination,
      expenseMode: recvExpenseMode,
      ...(recvExpenseMode === "link"
        ? {
            linkExpense: {
              projectId: destProjectId,
              expenseId: recvLinkExpenseId,
            },
          }
        : {}),
      ...(recvLabel.trim() ? { label: recvLabel.trim() } : {}),
      ...(recvSupplier.trim() ? { supplier: recvSupplier.trim() } : {}),
      ...(recvNotes.trim() ? { notes: recvNotes.trim() } : {}),
      actualDate: recvDate,
    });

    if (!result.ok) {
      setRecvError(result.error);
      return;
    }
    setRecvQty("");
    setRecvEx("");
    setRecvInc("");
    setRecvLabel("");
    setRecvSupplier("");
    setRecvNotes("");
    setRecvLinkExpenseId("");
    setRecvName("");
    setRecvSku("");
    setRecvGroupId("");
    setSelectedLotId(result.lotId);
  }

  function submitTransfer() {
    setActionError(null);
    if (!activeRow) return;
    const qty = parseNum(moveQty);
    if (qty == null || qty <= 0) {
      setActionError("Enter quantity to move");
      return;
    }
    const to = buildDestination(moveSite, moveDestSlot, moveProjectId);
    if (!to) {
      setActionError("Select destination project");
      return;
    }
    const result = transferStock({
      lotId: activeRow.lotId,
      qty,
      from: activeRow.location,
      to,
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setMoveQty("");
    setActiveBalanceId(null);
  }

  function submitConsume() {
    setActionError(null);
    if (!activeRow) return;
    const qty = parseNum(consumeQty);
    if (qty == null || qty <= 0) {
      setActionError("Enter quantity to consume");
      return;
    }
    const result = consumeStock({
      lotId: activeRow.lotId,
      qty,
      from: activeRow.location,
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setConsumeQty("");
    setActiveBalanceId(null);
  }

  if (!ready) {
    return (
      <div className="p-6 text-sm text-muted">Loading warehouse…</div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Warehouse</h1>
          <p className="text-[11px] text-muted">
            {pageTab === "stock"
              ? "Track receipts, dedicated use, leftovers, and transfers. Materials cost moves with stock; purchase dates stay on the original buy."
              : "Parts ordered, used, sent to Spares, and spare parts drawn into each project — with actual vs construction spend."}
          </p>
          {importMsg && (
            <p className="mt-1 text-[11px] text-teal-accent">{importMsg}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pageTab === "stock" && (
            <button
              type="button"
              disabled={importing}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Replace current warehouse inventory with MoneyWorks qty>0 snapshot (ELX/MH/Van)? System-* stock parks in ELX/Buffer until project mapping.",
                  )
                ) {
                  return;
                }
                setImporting(true);
                setImportMsg(null);
                const res = await importMoneyWorksWarehouse();
                setImporting(false);
                if (!res.ok) {
                  setImportMsg(`Import failed: ${res.error}`);
                  return;
                }
                setImportMsg(
                  `Imported ${res.stats.balances} stock lines · ${res.stats.items} items · ${res.stats.serials} serials · ${res.stats.boms} BOMs · ${res.stats.parkedSystem} System-* parked`,
                );
              }}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import MoneyWorks"}
            </button>
          )}
          {pageTab === "stock" && (
            <button
              type="button"
              disabled={mapping}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Create missing System-* projects if needed, move parked System stock to ELX / Project slots, and link lot costs to each project's first manufacture-materials expense?",
                  )
                ) {
                  return;
                }
                setMapping(true);
                setImportMsg(null);
                const res = await applySystemSkladMapping();
                setMapping(false);
                if (!res.ok) {
                  setImportMsg(`Mapping failed: ${res.error}`);
                  return;
                }
                setImportMsg(
                  `Mapped ${res.movedBalances} balances · ${res.maps} maps · linked ${res.linkedLots} lots` +
                    (res.createdProjects.length
                      ? ` · created projects: ${res.createdProjects.join(", ")}`
                      : "") +
                    (res.createdExpenses.length
                      ? ` · new materials expenses: ${res.createdExpenses.join(", ")}`
                      : "") +
                    (res.unmatched.length
                      ? ` · unmatched: ${res.unmatched.join(", ")}`
                      : ""),
                );
              }}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent disabled:opacity-50"
            >
              {mapping ? "Mapping…" : "Map System→Projects"}
            </button>
          )}
          {pageTab === "stock" && (
            <button
              type="button"
              disabled={linking}
              onClick={() => {
                if (
                  !window.confirm(
                    "Link all project-slot warehouse lots to each project's first manufacture-materials expense (create one if missing)?",
                  )
                ) {
                  return;
                }
                setLinking(true);
                setImportMsg(null);
                const res = linkProjectWarehouseExpenses();
                setLinking(false);
                if (!res.ok) {
                  setImportMsg(`Expense link failed: ${res.error}`);
                  return;
                }
                setImportMsg(
                  `Linked ${res.linkedLots} lots across ${res.projectCount} projects` +
                    (res.createdExpenses.length
                      ? ` · new expenses: ${res.createdExpenses.join(", ")}`
                      : ""),
                );
              }}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent disabled:opacity-50"
            >
              {linking ? "Linking…" : "Link WH→Expenses"}
            </button>
          )}
          {pageTab === "stock" && (
            <input
              className={`${inputCls} max-w-xs`}
              placeholder="Search all columns…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
            />
          )}
          {pageTab === "stock" && filtersActive && (
            <button
              type="button"
              onClick={clearStockFilters}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted hover:border-teal-accent hover:text-ink"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-line">
        {(
          [
            { id: "stock" as const, label: "Stock" },
            { id: "analysis" as const, label: "Analysis" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPageTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              pageTab === t.id
                ? "border-teal-accent text-teal-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === "stock" && (
        <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          {
            label: "Stock value",
            value: formatMoney(kpis.total),
            onClick: () => clearStockFilters(),
          },
          {
            label: "Spares value",
            value: formatMoney(kpis.spares),
            onClick: () => {
              clearStockFilters();
              setFilterSlots(new Set(["spare"]));
            },
          },
          {
            label: "Buffer value",
            value: formatMoney(kpis.buffer),
            onClick: () => {
              clearStockFilters();
              setFilterSlots(new Set(["buffer"]));
            },
          },
          {
            label: "Open lots",
            value: String(kpis.open),
            onClick: undefined as (() => void) | undefined,
          },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={!k.onClick}
            onClick={k.onClick}
            className={`rounded-lg border border-line bg-panel px-3 py-2 text-left ${
              k.onClick
                ? "cursor-pointer hover:border-teal-accent"
                : "cursor-default"
            }`}
            title={
              k.label === "Spares value"
                ? "Filter stock to Spare"
                : k.label === "Buffer value"
                  ? "Filter stock to Buffer"
                  : k.label === "Stock value"
                    ? "Clear stock filters"
                    : undefined
            }
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              {k.label}
            </div>
            <div className="text-base font-bold text-ink">{k.value}</div>
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-line bg-panel p-3">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-deep">
          Receive stock
        </h2>
        <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            className={`rounded px-2 py-1 ${recvMode === "new" ? "bg-teal-soft text-teal-accent" : "bg-surface text-muted"}`}
            onClick={() => setRecvMode("new")}
          >
            New item
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${recvMode === "existing" ? "bg-teal-soft text-teal-accent" : "bg-surface text-muted"}`}
            onClick={() => setRecvMode("existing")}
          >
            Catalog item
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          {recvMode === "new" ? (
            <>
              <div className="col-span-2">
                <label className={labelCls}>Item name</label>
                <input
                  className={inputCls}
                  value={recvName}
                  onChange={(e) => setRecvName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>SKU</label>
                <input
                  className={inputCls}
                  value={recvSku}
                  onChange={(e) => setRecvSku(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <input
                  className={inputCls}
                  value={recvUnit}
                  onChange={(e) => setRecvUnit(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Group</label>
                <select
                  className={inputCls}
                  value={recvGroupId}
                  onChange={(e) => setRecvGroupId(e.target.value)}
                >
                  <option value="">No group…</option>
                  {groupsForSelect.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2 md:col-span-3">
                <label className={labelCls}>Catalog item</label>
                <CatalogItemSearchSelect
                  items={warehouse.items}
                  groupById={groupById}
                  value={recvItemId}
                  inputClassName={inputCls}
                  onChange={(id) => {
                    setRecvItemId(id);
                    const it = warehouse.items.find((i) => i.id === id);
                    if (it) {
                      setRecvKind(it.defaultMaterialKind);
                      setRecvGroupId(it.groupId ?? "");
                    } else {
                      setRecvGroupId("");
                    }
                  }}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Group</label>
                <select
                  className={inputCls}
                  value={recvGroupId}
                  onChange={(e) => setRecvGroupId(e.target.value)}
                  disabled={!recvItemId}
                >
                  <option value="">No group…</option>
                  {groupsForSelect.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Qty</label>
            <input
              className={inputCls}
              value={recvQty}
              onChange={(e) => setRecvQty(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Unit € ex VAT</label>
            <input
              className={inputCls}
              value={recvEx}
              onChange={(e) => onRecvExChange(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Unit € inc VAT</label>
            <input
              className={inputCls}
              value={recvInc}
              onChange={(e) => onRecvIncChange(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              className={inputCls}
              value={recvDate}
              onChange={(e) => setRecvDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select
              className={inputCls}
              value={recvKind}
              onChange={(e) =>
                setRecvKind(e.target.value as WarehouseMaterialKind)
              }
            >
              {WAREHOUSE_MATERIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WAREHOUSE_MATERIAL_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Site</label>
            <select
              className={inputCls}
              value={recvSite}
              onChange={(e) => setRecvSite(e.target.value as WarehouseSite)}
            >
              {WAREHOUSE_SITES.map((s) => (
                <option key={s} value={s}>
                  {WAREHOUSE_SITE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Slot</label>
            <select
              className={inputCls}
              value={recvDestSlot}
              onChange={(e) => setRecvDestSlot(e.target.value as DestSlot)}
            >
              {(Object.keys(WAREHOUSE_SLOT_LABELS) as WarehouseSlot[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {WAREHOUSE_SLOT_LABELS[s]}
                  </option>
                ),
              )}
            </select>
          </div>
          {recvDestSlot === "project" && (
            <div className="col-span-2">
              <label className={labelCls}>Project</label>
              <select
                className={inputCls}
                value={recvProjectId}
                onChange={(e) => setRecvProjectId(e.target.value)}
              >
                <option value="">Select…</option>
                {salesProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Expense</label>
            <select
              className={inputCls}
              value={recvExpenseMode}
              onChange={(e) =>
                setRecvExpenseMode(e.target.value as "create" | "link")
              }
            >
              <option value="create">Create new</option>
              <option value="link">Link existing</option>
            </select>
          </div>
          {recvExpenseMode === "link" && (
            <div className="col-span-2">
              <label className={labelCls}>
                Link to predicted expense (budget)
              </label>
              <select
                className={inputCls}
                value={recvLinkExpenseId}
                onChange={(e) => setRecvLinkExpenseId(e.target.value)}
              >
                <option value="">Select…</option>
                {linkableExpenses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.dueDate} · {e.label} ·{" "}
                    {e.spent > 0
                      ? `spent ${formatMoney(e.spent)} / ${formatMoney(e.amount)}`
                      : formatMoney(e.amount)}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[9px] text-muted">
                Cashflow keeps the predicted amount until WH draws exceed it or
                the due date — then it snaps to actual spent.
              </p>
            </div>
          )}
          <div className="col-span-2">
            <label className={labelCls}>Label</label>
            <input
              className={inputCls}
              value={recvLabel}
              onChange={(e) => setRecvLabel(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className={labelCls}>Supplier</label>
            <input
              className={inputCls}
              value={recvSupplier}
              onChange={(e) => setRecvSupplier(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Notes</label>
            <input
              className={inputCls}
              value={recvNotes}
              onChange={(e) => setRecvNotes(e.target.value)}
            />
          </div>
        </div>
        {recvError && (
          <p className="mt-2 text-[11px] text-red-600">{recvError}</p>
        )}
        <button
          type="button"
          onClick={submitReceive}
          className="mt-3 rounded-lg bg-teal-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:opacity-90"
        >
          Receive into warehouse
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="overflow-x-auto rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-deep">
              Stock on hand
            </h2>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
              <span className="text-muted">
                {stockRows.length} line{stockRows.length === 1 ? "" : "s"}
                {filtersActive ? " (filtered)" : ""}
              </span>
              <span className="font-bold text-ink">
                Value {formatMoney(filteredStockValue)}
              </span>
            </div>
          </div>
          <table className="w-full min-w-[1200px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line bg-surface text-[9px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5">Site</th>
                <th className="px-2 py-1.5">Slot</th>
                <th className="px-2 py-1.5">Project</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Unit</th>
                <th className="px-2 py-1.5 text-right">Value</th>
                <th className="px-2 py-1.5">Received</th>
                <th className="px-2 py-1.5">Group</th>
                <th className="px-2 py-1.5">Expense</th>
                <th className="px-2 py-1.5">Lot</th>
                <th className="px-2 py-1.5">Actions</th>
              </tr>
              <tr className="border-b border-line bg-surface/80">
                <th className="px-2 py-1.5">
                  <input
                    className={filterCls}
                    placeholder="Item / SKU…"
                    value={filterItem}
                    onChange={(e) => setFilterItem(e.target.value)}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Sites"
                    options={WAREHOUSE_SITES.map((s) => ({
                      id: s,
                      label: WAREHOUSE_SITE_LABELS[s],
                    }))}
                    selectedIds={filterSites}
                    allLabel="All sites"
                    noneLabel="No sites"
                    manyLabel={(n) => `${n} sites`}
                    onToggle={(id) =>
                      setFilterSites((prev) =>
                        toggleInSet(prev, [...WAREHOUSE_SITES], id),
                      )
                    }
                    onSelectAll={() => setFilterSites(new Set(WAREHOUSE_SITES))}
                    onClear={() => setFilterSites(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Slots"
                    options={ALL_SLOTS.map((s) => ({
                      id: s,
                      label: WAREHOUSE_SLOT_LABELS[s],
                    }))}
                    selectedIds={filterSlots}
                    allLabel="All slots"
                    noneLabel="No slots"
                    manyLabel={(n) => `${n} slots`}
                    onToggle={(id) =>
                      setFilterSlots((prev) =>
                        toggleInSet(prev, [...ALL_SLOTS], id),
                      )
                    }
                    onSelectAll={() => setFilterSlots(new Set(ALL_SLOTS))}
                    onClear={() => setFilterSlots(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Projects"
                    options={projectFilterOptions}
                    selectedIds={selectedProjectIds}
                    allLabel="All projects"
                    noneLabel="No projects"
                    manyLabel={(n) => `${n} projects`}
                    onToggle={(id) =>
                      setFilterProjectIds((prev) =>
                        normalizeFilterSet(
                          toggleInSet(prev, projectFilterAllIds, id),
                          projectFilterAllIds,
                        ),
                      )
                    }
                    onSelectAll={() => setFilterProjectIds(null)}
                    onClear={() => setFilterProjectIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5" />
                <th className="px-2 py-1.5" />
                <th className="px-2 py-1.5" />
                <th className="px-2 py-1.5">
                  <div className="flex min-w-[9rem] flex-col gap-0.5">
                    <input
                      type="date"
                      className={filterCls}
                      value={filterReceivedFrom}
                      onChange={(e) => setFilterReceivedFrom(e.target.value)}
                      title="From"
                    />
                    <input
                      type="date"
                      className={filterCls}
                      value={filterReceivedTo}
                      onChange={(e) => setFilterReceivedTo(e.target.value)}
                      title="To"
                    />
                  </div>
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Groups"
                    options={groupFilterOptions}
                    selectedIds={selectedGroupIds}
                    allLabel="All groups"
                    noneLabel="No groups"
                    manyLabel={(n) => `${n} groups`}
                    onToggle={(id) =>
                      setFilterGroupIds((prev) =>
                        normalizeFilterSet(
                          toggleInSet(prev, groupFilterAllIds, id),
                          groupFilterAllIds,
                        ),
                      )
                    }
                    onSelectAll={() => setFilterGroupIds(null)}
                    onClear={() => setFilterGroupIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Expense link"
                    options={[...EXPENSE_FILTER_OPTIONS]}
                    selectedIds={selectedExpenseIds}
                    allLabel="All"
                    noneLabel="None"
                    manyLabel={(n) => `${n} selected`}
                    onToggle={(id) =>
                      setFilterExpenseIds((prev) =>
                        normalizeFilterSet(
                          toggleInSet(prev, [...EXPENSE_FILTER_IDS], id),
                          [...EXPENSE_FILTER_IDS],
                        ),
                      )
                    }
                    onSelectAll={() => setFilterExpenseIds(null)}
                    onClear={() => setFilterExpenseIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    className={filterCls}
                    placeholder="Lot id…"
                    value={filterLot}
                    onChange={(e) => setFilterLot(e.target.value)}
                  />
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {stockRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-2 py-6 text-center text-muted"
                  >
                    {filtersActive
                      ? "No stock matches these filters."
                      : "No stock on hand. Receive parts above."}
                  </td>
                </tr>
              ) : (
                stockRows.map((r) => (
                  <tr
                    key={`${r.balanceId}:${r.lotId}:${r.site}:${r.slot}:${r.projectId ?? ""}`}
                    className={`border-b border-line/60 hover:bg-surface/80 ${
                      selectedLotId === r.lotId ? "bg-teal-soft/40" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="text-left font-semibold text-ink hover:text-teal-accent"
                        onClick={() => setSelectedLotId(r.lotId)}
                      >
                        {r.itemName}
                      </button>
                      {r.sku && (
                        <div className="text-[9px] text-muted">{r.sku}</div>
                      )}
                      {r.label && (
                        <div className="text-[9px] text-muted">{r.label}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-semibold tabular-nums">
                      {WAREHOUSE_SITE_LABELS[r.site]}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          r.slot === "project"
                            ? "bg-teal-soft text-teal-accent"
                            : r.slot === "spare"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {WAREHOUSE_SLOT_LABELS[r.slot]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {r.projectName ?? (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatQty(r.qty)} {r.unit}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoney(r.unitCost)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {formatMoney(r.lineValue)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.receivedAt}</td>
                    <td
                      className="max-w-[8rem] truncate px-2 py-1.5 text-[9px] text-muted"
                      title={r.groupName}
                    >
                      {r.groupName ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.expenseId ? (
                        <span
                          className="rounded bg-teal-soft px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-teal-accent"
                          title={r.expenseId}
                        >
                          Linked
                        </span>
                      ) : (
                        <span className="text-[9px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[9px] text-muted">
                      {r.lotId.slice(0, 8)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase hover:border-teal-accent"
                          onClick={() => {
                            setActiveBalanceId(r.balanceId);
                            setSelectedLotId(r.lotId);
                            setMoveQty(String(r.qty));
                            setConsumeQty("");
                            setActionError(null);
                          }}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase hover:border-teal-accent"
                          onClick={() => {
                            setActiveBalanceId(r.balanceId);
                            setSelectedLotId(r.lotId);
                            setConsumeQty(String(r.qty));
                            setMoveQty("");
                            setActionError(null);
                          }}
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase hover:border-teal-accent"
                          onClick={() => openLotEditor(r.lotId, r.balanceId)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600 hover:border-red-500"
                          onClick={() => confirmDeleteLot(r.lotId)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <aside className="space-y-3">
          {editingLot && selectedLot && (
            <div className="rounded-lg border border-line bg-panel p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-deep">
                Edit lot — {selectedLotItem?.name ?? selectedLot.label ?? "Lot"}
              </h3>
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Catalog item</label>
                  <CatalogItemSearchSelect
                    items={catalogItemsSorted}
                    groupById={groupById}
                    value={editItemId}
                    inputClassName={inputCls}
                    onChange={(id) => {
                      setEditItemId(id);
                      const it = itemById.get(id);
                      setEditGroupId(it?.groupId ?? "");
                      if (it) setEditKind(it.defaultMaterialKind);
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Group</label>
                  <select
                    className={inputCls}
                    value={editGroupId}
                    onChange={(e) => setEditGroupId(e.target.value)}
                  >
                    <option value="">No group…</option>
                    {groupsForSelect.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>On-hand qty (this line)</label>
                  <input
                    className={inputCls}
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    placeholder="Qty"
                  />
                </div>
                <div>
                  <label className={labelCls}>Site</label>
                  <select
                    className={inputCls}
                    value={editSite}
                    onChange={(e) =>
                      setEditSite(e.target.value as WarehouseSite)
                    }
                  >
                    {WAREHOUSE_SITES.map((s) => (
                      <option key={s} value={s}>
                        {WAREHOUSE_SITE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Slot</label>
                  <select
                    className={inputCls}
                    value={editSlot}
                    onChange={(e) => {
                      const slot = e.target.value as WarehouseSlot;
                      setEditSlot(slot);
                      if (slot !== "project") setEditProjectId("");
                    }}
                  >
                    {ALL_SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {WAREHOUSE_SLOT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {editSlot === "project" && (
                  <div>
                    <label className={labelCls}>Project (stock location)</label>
                    <select
                      className={inputCls}
                      value={editProjectId}
                      onChange={(e) => setEditProjectId(e.target.value)}
                    >
                      <option value="">Select project…</option>
                      {allProjectsForEdit.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.isWarehouseHolding ? " (holding)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Purchase project</label>
                  <select
                    className={inputCls}
                    value={editPurchaseProjectId}
                    onChange={(e) => setEditPurchaseProjectId(e.target.value)}
                  >
                    <option value="">Select project…</option>
                    {allProjectsForEdit.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isWarehouseHolding ? " (holding)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Expense link</label>
                  <select
                    className={inputCls}
                    value={editExpenseId}
                    onChange={(e) => setEditExpenseId(e.target.value)}
                  >
                    <option value="">Unlinked</option>
                    {editExpenseOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Received date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Unit € ex VAT</label>
                  <input
                    className={inputCls}
                    value={editEx}
                    onChange={(e) => {
                      setEditEx(e.target.value);
                      const n = parseNum(e.target.value);
                      if (n != null) setEditInc(String(amountIncFromEx(n)));
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Unit € inc VAT</label>
                  <input
                    className={inputCls}
                    value={editInc}
                    onChange={(e) => {
                      setEditInc(e.target.value);
                      const n = parseNum(e.target.value);
                      if (n != null) setEditEx(String(amountExFromInc(n)));
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select
                    className={inputCls}
                    value={editKind}
                    onChange={(e) =>
                      setEditKind(e.target.value as WarehouseMaterialKind)
                    }
                  >
                    {WAREHOUSE_MATERIAL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {WAREHOUSE_MATERIAL_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Label</label>
                  <input
                    className={inputCls}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Supplier</label>
                  <input
                    className={inputCls}
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input
                    className={inputCls}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
                {editError && (
                  <p className="text-[11px] text-red-600">{editError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitLotEdit}
                    className="flex-1 rounded-lg bg-teal-accent px-2 py-1.5 text-[10px] font-bold uppercase text-white"
                  >
                    Save lot
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLot(false)}
                    className="rounded-lg border border-line px-2 py-1.5 text-[10px] font-bold uppercase text-muted"
                  >
                    Cancel
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => confirmDeleteLot(selectedLot.id)}
                  className="w-full text-[10px] font-semibold text-red-600 underline"
                >
                  Delete this lot
                </button>
              </div>
            </div>
          )}

          {activeRow && (
            <div className="rounded-lg border border-line bg-panel p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-deep">
                Actions — {activeRow.itemName}
              </h3>
              <p className="mb-2 text-[10px] text-muted">
                From {activeRow.locationLabel} · {activeRow.qty} available
              </p>
              <div className="space-y-2">
                  <div>
                    <label className={labelCls}>Qty to move</label>
                    <input
                      className={inputCls}
                      value={moveQty}
                      onChange={(e) => setMoveQty(e.target.value)}
                      placeholder="Qty"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>To site</label>
                    <select
                      className={inputCls}
                      value={moveSite}
                      onChange={(e) =>
                        setMoveSite(e.target.value as WarehouseSite)
                      }
                    >
                      {WAREHOUSE_SITES.map((s) => (
                        <option key={s} value={s}>
                          {WAREHOUSE_SITE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>To slot</label>
                    <select
                      className={inputCls}
                      value={moveDestSlot}
                      onChange={(e) =>
                        setMoveDestSlot(e.target.value as DestSlot)
                      }
                    >
                      {(Object.keys(WAREHOUSE_SLOT_LABELS) as WarehouseSlot[]).map(
                        (s) => (
                          <option key={s} value={s}>
                            {WAREHOUSE_SLOT_LABELS[s]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  {moveDestSlot === "project" && (
                    <div>
                      <label className={labelCls}>Project</label>
                      <select
                        className={inputCls}
                        value={moveProjectId}
                        onChange={(e) => setMoveProjectId(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {salesProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={submitTransfer}
                    className="w-full rounded-lg bg-teal-accent px-2 py-1.5 text-[10px] font-bold uppercase text-white"
                  >
                    Transfer (cost follows)
                  </button>
              </div>
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <div>
                  <label className={labelCls}>Qty to consume</label>
                  <input
                    className={inputCls}
                    value={consumeQty}
                    onChange={(e) => setConsumeQty(e.target.value)}
                    placeholder="Qty"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitConsume}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[10px] font-bold uppercase text-ink hover:border-teal-accent"
                >
                  Consume (expense stays)
                </button>
              </div>
              {actionError && (
                <p className="mt-2 text-[11px] text-red-600">{actionError}</p>
              )}
              <button
                type="button"
                className="mt-2 text-[10px] text-muted underline"
                onClick={() => setActiveBalanceId(null)}
              >
                Close
              </button>
            </div>
          )}

          <div className="rounded-lg border border-line bg-panel p-3">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-deep">
              Lot movement history
            </h3>
            {!selectedLotId ? (
              <p className="text-[11px] text-muted">
                Select a lot from the stock table to see its full path.
              </p>
            ) : (
              <>
                <p className="mb-2 font-mono text-[9px] text-muted">
                  {selectedLotId.slice(0, 8)} · on hand{" "}
                  {lotQtyOnHand(warehouse.balances, selectedLotId)}
                </p>
                <div className="mb-2 flex gap-1">
                  <button
                    type="button"
                    className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase hover:border-teal-accent"
                    onClick={() => openLotEditor(selectedLotId)}
                  >
                    Edit lot
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600 hover:border-red-500"
                    onClick={() => confirmDeleteLot(selectedLotId)}
                  >
                    Delete lot
                  </button>
                </div>
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {selectedLotMovements.length === 0 ? (
                    <li className="text-[11px] text-muted">No movements</li>
                  ) : (
                    selectedLotMovements.map((m) => (
                      <li
                        key={m.id}
                        className="rounded border border-line/70 bg-surface px-2 py-1.5"
                      >
                        <div className="text-[10px] font-semibold capitalize text-ink">
                          {m.action}
                          <span className="ml-1 font-normal text-muted">
                            ×{m.qty}
                          </span>
                        </div>
                        <div className="text-[9px] text-muted">
                          {m.from
                            ? locationLabel(m.from, (id) => nameById.get(id))
                            : "—"}
                          {" → "}
                          {m.to
                            ? locationLabel(m.to, (id) => nameById.get(id))
                            : "—"}
                        </div>
                        <div className="text-[9px] tabular-nums text-muted">
                          {m.occurredAt.slice(0, 19).replace("T", " ")}
                        </div>
                        {m.note && (
                          <div className="text-[9px] text-muted">{m.note}</div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      {warehouse.lots.length > 0 && (
        <section className="rounded-lg border border-line bg-panel p-3">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-deep">
            All lots
          </h2>
          <p className="mb-2 text-[10px] text-muted">
            Includes fully used lots. Edit costs/dates or delete a mistaken
            receipt (also removes linked expenses).
          </p>
          <ul className="divide-y divide-line/60">
            {[...warehouse.lots]
              .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
              .map((lot) => {
                const item = itemById.get(lot.itemId);
                const onHand = lotQtyOnHand(warehouse.balances, lot.id);
                return (
                  <li
                    key={lot.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[11px]"
                  >
                    <button
                      type="button"
                      className="text-left font-semibold text-ink hover:text-teal-accent"
                      onClick={() => {
                        setSelectedLotId(lot.id);
                        setEditingLot(false);
                      }}
                    >
                      {item?.name ?? lot.label ?? lot.id.slice(0, 8)}
                      <span className="ml-2 font-normal text-muted">
                        {lot.receivedAt} · on hand {onHand}/{lot.qtyReceived} ·{" "}
                        {formatMoney(lot.unitCostIncVat)}/u
                      </span>
                    </button>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase hover:border-teal-accent"
                        onClick={() => openLotEditor(lot.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600 hover:border-red-500"
                        onClick={() => confirmDeleteLot(lot.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
        </>
      )}

      {pageTab === "analysis" && (
      <section className="rounded-lg border border-line bg-panel p-3">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-deep">
              Warehouse analysis
            </h2>
            <p className="mt-0.5 max-w-xl text-[10px] text-muted">
              Project part usage, and MoneyWorks BOMs (PROD) for materials
              per finished unit. Optionally compare a BOM to a project.
            </p>
          </div>
          <div className="flex gap-1">
            {(
              [
                { id: "project" as const, label: "Project" },
                { id: "bom" as const, label: "BOM" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAnalysisView(t.id)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                  analysisView === t.id
                    ? "bg-teal-soft text-deep"
                    : "border border-line text-muted hover:border-teal-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {analysisView === "project" && (
          <>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[200px]">
            <label className={labelCls}>Project</label>
            <select
              className={inputCls}
              value={analysisProjectId}
              onChange={(e) => setAnalysisProjectId(e.target.value)}
              disabled={analysisProjects.length === 0}
            >
              {analysisProjects.length === 0 ? (
                <option value="">No warehouse activity yet</option>
              ) : (
                analysisProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {!projectMetrics || projectMetrics.lines.length === 0 ? (
          <p className="text-[11px] text-muted">
            {analysisProjects.length === 0
              ? "Receive or move stock to a project to unlock analysis."
              : "No part movements for this project yet."}
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "Ordered",
                  value: formatQty(projectMetrics.totals.orderedQty),
                  sub: formatMoney(projectMetrics.totals.orderedValue),
                },
                {
                  label: "Used",
                  value: formatQty(projectMetrics.totals.usedQty),
                  sub: formatMoney(projectMetrics.totals.usedValue),
                },
                {
                  label: "→ Spares",
                  value: formatQty(projectMetrics.totals.toSparesQty),
                  sub: formatMoney(projectMetrics.totals.toSparesValue),
                },
                {
                  label: "Spares used",
                  value: formatQty(projectMetrics.totals.spareUsedQty),
                  sub: formatMoney(projectMetrics.totals.spareUsedValue),
                },
                {
                  label: "Actual used cost",
                  value: formatMoney(projectMetrics.totals.usedValue),
                  sub: "All parts used",
                },
                {
                  label: "Construction",
                  value: formatMoney(projectMetrics.totals.constructionValue),
                  sub: "Excl. spares used",
                },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-lg border border-line/80 bg-surface px-2.5 py-2"
                >
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                    {k.label}
                  </div>
                  <div className="text-sm font-bold tabular-nums text-ink">
                    {k.value}
                  </div>
                  <div className="text-[9px] tabular-nums text-muted">
                    {k.sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-line text-[9px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1.5 font-semibold">Part</th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Ordered
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Used
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      → Spares
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      From spares
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Spares used
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      On hand
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Used €
                    </th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Constr. €
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectMetrics.lines.map((line) => {
                    const constr = roundMoneyDisplay(
                      line.usedValue - line.spareUsedValue,
                    );
                    return (
                      <tr
                        key={line.itemId}
                        className="border-b border-line/50 hover:bg-surface/70"
                      >
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-ink">
                            {line.itemName}
                          </div>
                          <div className="text-[9px] text-muted">
                            {line.sku ? `${line.sku} · ` : ""}
                            {line.unit}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.orderedQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.usedQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.toSparesQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.fromSparesQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.spareUsedQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatQty(line.onHandQty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatMoney(line.usedValue)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {formatMoney(constr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line text-[11px] font-semibold">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.orderedQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.usedQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.toSparesQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.fromSparesQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.spareUsedQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatQty(projectMetrics.totals.onHandQty)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(projectMetrics.totals.usedValue)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(projectMetrics.totals.constructionValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
          </>
        )}

        {analysisView === "bom" && (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label className={labelCls}>BOM (finished article)</label>
                <select
                  className={inputCls}
                  value={analysisBomId}
                  onChange={(e) => setAnalysisBomId(e.target.value)}
                  disabled={bomCatalog.length === 0}
                >
                  {bomCatalog.length === 0 ? (
                    <option value="">No recipes yet</option>
                  ) : (
                    bomCatalog.map((b) => (
                      <option key={b.id} value={b.id}>
                        {(b.productFamily ? `${b.productFamily} · ` : "") +
                          b.name}
                        {b.lines.length
                          ? ` (${b.lines.length} parts)`
                          : ""}
                        {isUserOwnedBomSourceKey(b.sourceKey) ? " ★" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="min-w-[200px]">
                <label className={labelCls}>Compare to project</label>
                <select
                  className={inputCls}
                  value={analysisProjectId}
                  onChange={(e) => setAnalysisProjectId(e.target.value)}
                >
                  <option value="">— Recipe only —</option>
                  {analysisProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={openNewBomEditor}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent"
                >
                  New recipe
                </button>
                {selectedBom ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditBomEditor(selectedBom.id)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const src = selectedBom;
                        const res = duplicateWarehouseBom(src.id);
                        if (!res.ok) {
                          setBomEditError(res.error);
                          return;
                        }
                        setAnalysisBomId(res.bomId);
                        setBomEditingId(res.bomId);
                        setBomDraftName(`${src.name} (copy)`);
                        setBomDraftFamily(src.productFamily ?? "");
                        setBomDraftGroup(src.outputGroup ?? "");
                        setBomDraftOutputItemId(src.outputItemId ?? "");
                        setBomDraftNotes(src.notes ?? "");
                        setBomDraftLines(
                          src.lines.length > 0
                            ? src.lines.map((l) => ({
                                key: crypto.randomUUID(),
                                componentName: l.componentName,
                                componentGroup: l.componentGroup ?? "",
                                componentItemId: l.componentItemId ?? "",
                                qtyPerUnit: String(l.qtyPerUnit),
                                unitCost:
                                  l.unitCost != null ? String(l.unitCost) : "",
                              }))
                            : [emptyBomDraftLine()],
                        );
                        setBomEditError(null);
                        setBomEditorOpen(true);
                      }}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink hover:border-teal-accent"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete recipe “${selectedBom.name}”?`,
                          )
                        ) {
                          return;
                        }
                        const res = deleteWarehouseBom(selectedBom.id);
                        if (!res.ok) setBomEditError(res.error);
                      }}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 hover:border-rose-400"
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {bomEditorOpen && (
              <div className="mb-3 rounded-lg border border-teal-accent/40 bg-surface p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-deep">
                    {bomEditingId ? "Edit recipe" : "New recipe"}
                  </h3>
                  <p className="text-[10px] text-muted">
                    Qty is per 1 finished unit. ★ recipes are kept across MoneyWorks re-import.
                  </p>
                </div>
                <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={labelCls}>Name *</label>
                    <input
                      className={inputCls}
                      value={bomDraftName}
                      onChange={(e) => setBomDraftName(e.target.value)}
                      placeholder="Finished article"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Product family</label>
                    <input
                      className={inputCls}
                      value={bomDraftFamily}
                      onChange={(e) => setBomDraftFamily(e.target.value)}
                      placeholder="e.g. Демистър"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Output group</label>
                    <input
                      className={inputCls}
                      value={bomDraftGroup}
                      onChange={(e) => setBomDraftGroup(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Link catalog item</label>
                    <select
                      className={inputCls}
                      value={bomDraftOutputItemId}
                      onChange={(e) => setBomDraftOutputItemId(e.target.value)}
                    >
                      <option value="">— Optional —</option>
                      {catalogItemsSorted.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                          {it.sku ? ` (${it.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <label className={labelCls}>Notes</label>
                  <input
                    className={inputCls}
                    value={bomDraftNotes}
                    onChange={(e) => setBomDraftNotes(e.target.value)}
                  />
                </div>
                <div className="mb-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-line text-[9px] uppercase tracking-wide text-muted">
                        <th className="px-1.5 py-1">Catalog</th>
                        <th className="px-1.5 py-1">Component name</th>
                        <th className="px-1.5 py-1">Group</th>
                        <th className="px-1.5 py-1 text-right">Qty / unit</th>
                        <th className="px-1.5 py-1 text-right">Unit €</th>
                        <th className="px-1.5 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {bomDraftLines.map((row, idx) => (
                        <tr key={row.key} className="border-b border-line/50">
                          <td className="px-1.5 py-1">
                            <select
                              className={inputCls}
                              value={row.componentItemId}
                              onChange={(e) => {
                                const id = e.target.value;
                                const item = catalogItemsSorted.find(
                                  (x) => x.id === id,
                                );
                                setBomDraftLines((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          componentItemId: id,
                                          componentName:
                                            item?.name ?? r.componentName,
                                        }
                                      : r,
                                  ),
                                );
                              }}
                            >
                              <option value="">— Free text —</option>
                              {catalogItemsSorted.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              className={inputCls}
                              value={row.componentName}
                              onChange={(e) =>
                                setBomDraftLines((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          componentName: e.target.value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              className={inputCls}
                              value={row.componentGroup}
                              onChange={(e) =>
                                setBomDraftLines((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          componentGroup: e.target.value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              className={`${inputCls} text-right`}
                              value={row.qtyPerUnit}
                              onChange={(e) =>
                                setBomDraftLines((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, qtyPerUnit: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              className={`${inputCls} text-right`}
                              value={row.unitCost}
                              onChange={(e) =>
                                setBomDraftLines((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, unitCost: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <button
                              type="button"
                              className="text-[10px] text-muted hover:text-rose-700"
                              onClick={() =>
                                setBomDraftLines((prev) =>
                                  prev.length <= 1
                                    ? [emptyBomDraftLine()]
                                    : prev.filter((_, i) => i !== idx),
                                )
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBomDraftLines((prev) => [
                        ...prev,
                        emptyBomDraftLine(),
                      ])
                    }
                    className="rounded border border-line px-2 py-1 text-[10px] font-semibold text-ink hover:border-teal-accent"
                  >
                    + Component
                  </button>
                  <button
                    type="button"
                    onClick={saveBomEditor}
                    className="rounded bg-teal-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                  >
                    Save recipe
                  </button>
                  <button
                    type="button"
                    onClick={closeBomEditor}
                    className="rounded border border-line px-2.5 py-1 text-[10px] font-semibold text-muted"
                  >
                    Cancel
                  </button>
                  {bomEditError ? (
                    <span className="text-[10px] text-rose-700">
                      {bomEditError}
                    </span>
                  ) : null}
                </div>
              </div>
            )}

            {!selectedBom && !bomEditorOpen ? (
              <p className="text-[11px] text-muted">
                Import MoneyWorks or create a new recipe to get started.
              </p>
            ) : selectedBom && !bomEditorOpen ? (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    {
                      label: "Components",
                      value: String(selectedBom.lines.length),
                      sub: selectedBom.outputGroup ?? "—",
                    },
                    {
                      label: "Produced (hist.)",
                      value: formatQty(selectedBom.qtyProduced),
                      sub: selectedBom.productFamily || "No family",
                    },
                    {
                      label: "Est. materials",
                      value: formatMoney(selectedBom.estimatedMaterialCost),
                      sub: "Per finished unit",
                    },
                    {
                      label: "Ownership",
                      value: isUserOwnedBomSourceKey(selectedBom.sourceKey)
                        ? "Local ★"
                        : "Imported",
                      sub: selectedBom.outputItemId
                        ? "Catalog linked"
                        : "Name only",
                    },
                  ].map((k) => (
                    <div
                      key={k.label}
                      className="rounded-lg border border-line/80 bg-surface px-2.5 py-2"
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                        {k.label}
                      </div>
                      <div className="text-sm font-bold tabular-nums text-ink">
                        {k.value}
                      </div>
                      <div className="text-[9px] text-muted">{k.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-line text-[9px] uppercase tracking-wide text-muted">
                        <th className="px-2 py-1.5 font-semibold">Component</th>
                        <th className="px-2 py-1.5 font-semibold text-right">
                          BOM qty
                        </th>
                        <th className="px-2 py-1.5 font-semibold text-right">
                          Unit €
                        </th>
                        <th className="px-2 py-1.5 font-semibold text-right">
                          Line €
                        </th>
                        {analysisProjectId ? (
                          <>
                            <th className="px-2 py-1.5 font-semibold text-right">
                              Project used
                            </th>
                            <th className="px-2 py-1.5 font-semibold text-right">
                              On hand
                            </th>
                            <th className="px-2 py-1.5 font-semibold text-right">
                              Δ vs BOM
                            </th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {(analysisProjectId
                        ? bomVsProject
                        : selectedBom.lines.map((l) => ({
                            componentName: l.componentName,
                            componentGroup: l.componentGroup,
                            bomQty: l.qtyPerUnit,
                            usedQty: 0,
                            onHandQty: 0,
                            bomUnitCost: l.unitCost,
                            varianceQty: 0,
                          }))
                      ).map((line, idx) => {
                        const lineCost = roundMoneyDisplay(
                          line.bomQty * (line.bomUnitCost ?? 0),
                        );
                        return (
                          <tr
                            key={`${line.componentName}:${idx}`}
                            className="border-b border-line/50 hover:bg-surface/70"
                          >
                            <td className="px-2 py-1.5">
                              <div className="font-semibold text-ink">
                                {line.componentName}
                              </div>
                              {line.componentGroup ? (
                                <div className="text-[9px] text-muted">
                                  {line.componentGroup}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatQty(line.bomQty) || "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {line.bomUnitCost != null
                                ? formatMoney(line.bomUnitCost)
                                : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {line.bomUnitCost != null
                                ? formatMoney(lineCost)
                                : "—"}
                            </td>
                            {analysisProjectId ? (
                              <>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                  {formatQty(line.usedQty)}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                  {formatQty(line.onHandQty)}
                                </td>
                                <td
                                  className={`px-2 py-1.5 text-right tabular-nums ${
                                    line.varianceQty > 0.0001
                                      ? "text-amber-700"
                                      : line.varianceQty < -0.0001
                                        ? "text-teal-accent"
                                        : ""
                                  }`}
                                >
                                  {Math.abs(line.varianceQty) < 0.00005
                                    ? "—"
                                    : `${line.varianceQty > 0 ? "+" : ""}${
                                        Number.isInteger(line.varianceQty)
                                          ? String(line.varianceQty)
                                          : line.varianceQty
                                              .toFixed(2)
                                              .replace(/\.?0+$/, "")
                                      }`}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
      </section>
      )}
    </div>
  );
}
