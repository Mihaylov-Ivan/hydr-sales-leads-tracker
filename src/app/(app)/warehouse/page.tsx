"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  WarehouseLocation,
  WarehouseMaterialKind,
  WAREHOUSE_MATERIAL_KINDS,
  WAREHOUSE_MATERIAL_KIND_LABELS,
  amountExFromInc,
  amountIncFromEx,
  todayDate,
} from "@/lib/types";
import {
  locationLabel,
  lotQtyOnHand,
  openLotsCount,
  spentAgainstExpense,
  stockValueAtLocation,
  totalStockValue,
} from "@/lib/warehouse";

const inputCls =
  "w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none focus:border-teal-accent";
const labelCls =
  "mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-muted";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
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
  locationLabel: string;
  qty: number;
  unitCost: number;
  lineValue: number;
  receivedAt: string;
  expenseId: string;
  label?: string;
};

type DestKind = "project" | "spare" | "buffer";

export default function WarehousePage() {
  const {
    projects,
    ready,
    warehouse,
    receiveStock,
    transferStock,
    consumeStock,
    updateWarehouseLot,
    deleteWarehouseLot,
    ensureWarehouseHoldingProject,
  } = useProjects();

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Receive form
  const [recvMode, setRecvMode] = useState<"existing" | "new">("new");
  const [recvItemId, setRecvItemId] = useState("");
  const [recvName, setRecvName] = useState("");
  const [recvSku, setRecvSku] = useState("");
  const [recvUnit, setRecvUnit] = useState("pcs");
  const [recvQty, setRecvQty] = useState("");
  const [recvEx, setRecvEx] = useState("");
  const [recvInc, setRecvInc] = useState("");
  const [recvDate, setRecvDate] = useState(todayDate());
  const [recvKind, setRecvKind] =
    useState<WarehouseMaterialKind>("materials");
  const [recvDestKind, setRecvDestKind] = useState<DestKind>("project");
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
  const [moveDestKind, setMoveDestKind] = useState<DestKind>("spare");
  const [moveProjectId, setMoveProjectId] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [activeBalanceId, setActiveBalanceId] = useState<string | null>(null);
  const [editingLot, setEditingLot] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editEx, setEditEx] = useState("");
  const [editInc, setEditInc] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editKind, setEditKind] =
    useState<WarehouseMaterialKind>("materials");
  const [editError, setEditError] = useState<string | null>(null);

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
    const spares = stockValueAtLocation(
      warehouse.lots,
      warehouse.balances,
      "spare",
    );
    const buffer = stockValueAtLocation(
      warehouse.lots,
      warehouse.balances,
      "buffer",
    );
    const open = openLotsCount(warehouse.lots, warehouse.balances);
    return { total, spares, buffer, open };
  }, [warehouse.lots, warehouse.balances]);

  const stockRows = useMemo(() => {
    const rows: StockRow[] = [];
    for (const b of warehouse.balances) {
      if (b.qty <= 0) continue;
      const lot = lotById.get(b.lotId);
      const item = lot ? itemById.get(lot.itemId) : undefined;
      if (!lot || !item) continue;
      rows.push({
        balanceId: b.id,
        lotId: lot.id,
        itemId: item.id,
        itemName: item.name,
        ...(item.sku ? { sku: item.sku } : {}),
        unit: item.unit,
        location: b.location,
        locationLabel: locationLabel(b.location, (id) => nameById.get(id)),
        qty: b.qty,
        unitCost: lot.unitCostIncVat,
        lineValue: b.qty * lot.unitCostIncVat,
        receivedAt: lot.receivedAt,
        expenseId: lot.expenseId,
        ...(lot.label ? { label: lot.label } : {}),
      });
    }
    const q = filterQ.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.itemName, r.sku, r.label, r.locationLabel, r.lotId]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : rows;
    return filtered.sort((a, b) => {
      const n = a.itemName.localeCompare(b.itemName);
      if (n !== 0) return n;
      return a.locationLabel.localeCompare(b.locationLabel);
    });
  }, [
    warehouse.balances,
    lotById,
    itemById,
    nameById,
    filterQ,
  ]);

  const linkableExpenses = useMemo(() => {
    const destProjectId =
      recvDestKind === "project"
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
    recvDestKind,
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

  function openLotEditor(lotId: string) {
    const lot = lotById.get(lotId);
    if (!lot) return;
    setSelectedLotId(lotId);
    setEditingLot(true);
    setEditError(null);
    setEditDate(lot.receivedAt);
    setEditInc(String(lot.unitCostIncVat));
    setEditEx(String(lot.unitCostExVat));
    setEditLabel(lot.label ?? "");
    setEditSupplier(lot.supplier ?? "");
    setEditNotes(lot.notes ?? "");
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
    const result = updateWarehouseLot({
      lotId: selectedLotId,
      receivedAt: editDate,
      unitCostIncVat: unitInc,
      unitCostExVat: unitEx,
      label: editLabel.trim() || null,
      supplier: editSupplier.trim() || null,
      notes: editNotes.trim() || null,
      materialKind: editKind,
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

  function buildDestination(kind: DestKind, projectId: string): WarehouseLocation | null {
    if (kind === "spare") return { type: "spare" };
    if (kind === "buffer") return { type: "buffer" };
    if (!projectId) return null;
    return { type: "project", projectId };
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
    const destination = buildDestination(recvDestKind, recvProjectId);
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
      destination.type === "project"
        ? destination.projectId!
        : holdingProject?.id ?? warehouse.holdingProjectId ?? "";

    const result = receiveStock({
      ...(recvMode === "existing"
        ? { itemId: recvItemId }
        : {
            newItem: {
              name: recvName.trim(),
              ...(recvSku.trim() ? { sku: recvSku.trim() } : {}),
              unit: recvUnit.trim() || "pcs",
              defaultMaterialKind: recvKind,
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
    const to = buildDestination(moveDestKind, moveProjectId);
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
            Track receipts, dedicated use, leftovers, and transfers. Materials
            cost moves with stock; purchase dates stay on the original buy.
          </p>
        </div>
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Filter stock…"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Stock value", value: formatMoney(kpis.total) },
          { label: "Spares value", value: formatMoney(kpis.spares) },
          { label: "Buffer value", value: formatMoney(kpis.buffer) },
          { label: "Open lots", value: String(kpis.open) },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-line bg-panel px-3 py-2"
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              {k.label}
            </div>
            <div className="text-base font-bold text-ink">{k.value}</div>
          </div>
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
            </>
          ) : (
            <div className="col-span-2">
              <label className={labelCls}>Catalog item</label>
              <select
                className={inputCls}
                value={recvItemId}
                onChange={(e) => {
                  setRecvItemId(e.target.value);
                  const it = warehouse.items.find((i) => i.id === e.target.value);
                  if (it) setRecvKind(it.defaultMaterialKind);
                }}
              >
                <option value="">Select…</option>
                {warehouse.items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                    {it.sku ? ` (${it.sku})` : ""}
                  </option>
                ))}
              </select>
            </div>
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
            <label className={labelCls}>Destination</label>
            <select
              className={inputCls}
              value={recvDestKind}
              onChange={(e) => setRecvDestKind(e.target.value as DestKind)}
            >
              <option value="project">Project</option>
              <option value="spare">Spares</option>
              <option value="buffer">Buffer</option>
            </select>
          </div>
          {recvDestKind === "project" && (
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
          <table className="w-full min-w-[900px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line bg-surface text-[9px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5">Location</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Unit</th>
                <th className="px-2 py-1.5 text-right">Value</th>
                <th className="px-2 py-1.5">Received</th>
                <th className="px-2 py-1.5">Lot</th>
                <th className="px-2 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-2 py-6 text-center text-muted"
                  >
                    No stock on hand. Receive parts above.
                  </td>
                </tr>
              ) : (
                stockRows.map((r) => (
                  <tr
                    key={r.balanceId}
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
                    </td>
                    <td className="px-2 py-1.5">{r.locationLabel}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.qty} {r.unit}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoney(r.unitCost)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {formatMoney(r.lineValue)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.receivedAt}</td>
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
                          onClick={() => openLotEditor(r.lotId)}
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
                    <label className={labelCls}>To</label>
                    <select
                      className={inputCls}
                      value={moveDestKind}
                      onChange={(e) =>
                        setMoveDestKind(e.target.value as DestKind)
                      }
                    >
                      <option value="spare">Spares</option>
                      <option value="buffer">Buffer</option>
                      <option value="project">Project</option>
                    </select>
                  </div>
                  {moveDestKind === "project" && (
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
    </div>
  );
}
