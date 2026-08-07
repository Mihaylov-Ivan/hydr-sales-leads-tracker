import {
  Project,
  WarehouseLot,
  WarehouseState,
} from "./types";
import { roundMoney } from "./warehouse";

export type ProjectPartLine = {
  itemId: string;
  itemName: string;
  sku?: string;
  unit: string;
  /** Received into project or transferred in (excl. from spares) */
  orderedQty: number;
  /** Consumed while at the project */
  usedQty: number;
  /** Moved project → Spares */
  toSparesQty: number;
  /** Moved Spares → project */
  fromSparesQty: number;
  /** Consumed at project that had come from Spares (FIFO per lot) */
  spareUsedQty: number;
  /** Still on hand at the project */
  onHandQty: number;
  orderedValue: number;
  usedValue: number;
  toSparesValue: number;
  fromSparesValue: number;
  spareUsedValue: number;
  onHandValue: number;
};

export type ProjectWarehouseMetrics = {
  projectId: string;
  projectName: string;
  lines: ProjectPartLine[];
  totals: {
    orderedQty: number;
    usedQty: number;
    toSparesQty: number;
    fromSparesQty: number;
    spareUsedQty: number;
    onHandQty: number;
    orderedValue: number;
    /** All parts used at the project (inc. spare-sourced) */
    usedValue: number;
    toSparesValue: number;
    fromSparesValue: number;
    spareUsedValue: number;
    onHandValue: number;
    /**
     * Construction spend: used value excluding spare parts used on the project.
     */
    constructionValue: number;
  };
};

type LotTrack = {
  /** Qty currently attributed to this project */
  atProject: number;
  /** Of atProject, how much originated from Spares */
  fromSpareAtProject: number;
};

function emptyLine(
  itemId: string,
  itemName: string,
  unit: string,
  sku?: string,
): ProjectPartLine {
  return {
    itemId,
    itemName,
    ...(sku ? { sku } : {}),
    unit,
    orderedQty: 0,
    usedQty: 0,
    toSparesQty: 0,
    fromSparesQty: 0,
    spareUsedQty: 0,
    onHandQty: 0,
    orderedValue: 0,
    usedValue: 0,
    toSparesValue: 0,
    fromSparesValue: 0,
    spareUsedValue: 0,
    onHandValue: 0,
  };
}

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function addQtyValue(
  line: ProjectPartLine,
  field: "ordered" | "used" | "toSpares" | "fromSpares" | "spareUsed",
  qty: number,
  unitCost: number,
): void {
  if (!(qty > 0)) return;
  const value = roundMoney(qty * unitCost);
  if (field === "ordered") {
    line.orderedQty = roundQty(line.orderedQty + qty);
    line.orderedValue = roundMoney(line.orderedValue + value);
  } else if (field === "used") {
    line.usedQty = roundQty(line.usedQty + qty);
    line.usedValue = roundMoney(line.usedValue + value);
  } else if (field === "toSpares") {
    line.toSparesQty = roundQty(line.toSparesQty + qty);
    line.toSparesValue = roundMoney(line.toSparesValue + value);
  } else if (field === "fromSpares") {
    line.fromSparesQty = roundQty(line.fromSparesQty + qty);
    line.fromSparesValue = roundMoney(line.fromSparesValue + value);
  } else {
    line.spareUsedQty = roundQty(line.spareUsedQty + qty);
    line.spareUsedValue = roundMoney(line.spareUsedValue + value);
  }
}

/**
 * Project-level warehouse analysis from lots, balances, and movement history.
 */
export function buildProjectWarehouseMetrics(
  projectId: string,
  projectName: string,
  state: WarehouseState,
): ProjectWarehouseMetrics {
  const lotById = new Map(state.lots.map((l) => [l.id, l]));
  const itemById = new Map(state.items.map((i) => [i.id, i]));
  const lines = new Map<string, ProjectPartLine>();

  const getLine = (lot: WarehouseLot): ProjectPartLine => {
    const item = itemById.get(lot.itemId);
    const itemId = lot.itemId;
    let line = lines.get(itemId);
    if (!line) {
      line = emptyLine(
        itemId,
        item?.name ?? lot.label ?? itemId.slice(0, 8),
        item?.unit ?? "pcs",
        item?.sku,
      );
      lines.set(itemId, line);
    }
    return line;
  };

  const tracks = new Map<string, LotTrack>();
  const getTrack = (lotId: string): LotTrack => {
    let t = tracks.get(lotId);
    if (!t) {
      t = { atProject: 0, fromSpareAtProject: 0 };
      tracks.set(lotId, t);
    }
    return t;
  };

  const chronological = [...state.movements].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  for (const m of chronological) {
    const lot = lotById.get(m.lotId);
    if (!lot) continue;
    const line = getLine(lot);
    const cost = lot.unitCostIncVat;
    const track = getTrack(m.lotId);
    const qty = m.qty;
    if (!(qty > 0)) continue;

    const toProject =
      m.to?.type === "project" && m.to.projectId === projectId;
    const fromProject =
      m.from?.type === "project" && m.from.projectId === projectId;

    if (m.action === "receive" && toProject) {
      addQtyValue(line, "ordered", qty, cost);
      track.atProject = roundQty(track.atProject + qty);
      continue;
    }

    if (m.action === "transfer" || m.action === "allocate") {
      if (toProject) {
        if (m.from?.type === "spare") {
          addQtyValue(line, "fromSpares", qty, cost);
          track.atProject = roundQty(track.atProject + qty);
          track.fromSpareAtProject = roundQty(
            track.fromSpareAtProject + qty,
          );
        } else {
          // From buffer / other project / unallocated — counts as ordered in
          addQtyValue(line, "ordered", qty, cost);
          track.atProject = roundQty(track.atProject + qty);
        }
        continue;
      }

      if (fromProject) {
        if (m.to?.type === "spare") {
          addQtyValue(line, "toSpares", qty, cost);
        }
        const leave = Math.min(qty, track.atProject);
        const spareLeave = Math.min(leave, track.fromSpareAtProject);
        track.fromSpareAtProject = roundQty(
          track.fromSpareAtProject - spareLeave,
        );
        track.atProject = roundQty(track.atProject - leave);
        continue;
      }
    }

    if (m.action === "consume" && fromProject) {
      addQtyValue(line, "used", qty, cost);
      const use = Math.min(qty, track.atProject);
      const spareUse = Math.min(use, track.fromSpareAtProject);
      if (spareUse > 0) {
        addQtyValue(line, "spareUsed", spareUse, cost);
      }
      track.fromSpareAtProject = roundQty(
        track.fromSpareAtProject - spareUse,
      );
      track.atProject = roundQty(track.atProject - use);
    }
  }

  // Current on-hand at project from balances (authoritative)
  for (const b of state.balances) {
    if (b.location.type !== "project" || b.location.projectId !== projectId) {
      continue;
    }
    if (!(b.qty > 0)) continue;
    const lot = lotById.get(b.lotId);
    if (!lot) continue;
    const line = getLine(lot);
    line.onHandQty = roundQty(line.onHandQty + b.qty);
    line.onHandValue = roundMoney(
      line.onHandValue + b.qty * lot.unitCostIncVat,
    );
  }

  const sorted = [...lines.values()]
    .filter(
      (l) =>
        l.orderedQty > 0 ||
        l.usedQty > 0 ||
        l.toSparesQty > 0 ||
        l.fromSparesQty > 0 ||
        l.spareUsedQty > 0 ||
        l.onHandQty > 0,
    )
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const totals = {
    orderedQty: 0,
    usedQty: 0,
    toSparesQty: 0,
    fromSparesQty: 0,
    spareUsedQty: 0,
    onHandQty: 0,
    orderedValue: 0,
    usedValue: 0,
    toSparesValue: 0,
    fromSparesValue: 0,
    spareUsedValue: 0,
    onHandValue: 0,
    constructionValue: 0,
  };

  for (const l of sorted) {
    totals.orderedQty = roundQty(totals.orderedQty + l.orderedQty);
    totals.usedQty = roundQty(totals.usedQty + l.usedQty);
    totals.toSparesQty = roundQty(totals.toSparesQty + l.toSparesQty);
    totals.fromSparesQty = roundQty(totals.fromSparesQty + l.fromSparesQty);
    totals.spareUsedQty = roundQty(totals.spareUsedQty + l.spareUsedQty);
    totals.onHandQty = roundQty(totals.onHandQty + l.onHandQty);
    totals.orderedValue = roundMoney(totals.orderedValue + l.orderedValue);
    totals.usedValue = roundMoney(totals.usedValue + l.usedValue);
    totals.toSparesValue = roundMoney(totals.toSparesValue + l.toSparesValue);
    totals.fromSparesValue = roundMoney(
      totals.fromSparesValue + l.fromSparesValue,
    );
    totals.spareUsedValue = roundMoney(
      totals.spareUsedValue + l.spareUsedValue,
    );
    totals.onHandValue = roundMoney(totals.onHandValue + l.onHandValue);
  }
  totals.constructionValue = roundMoney(
    totals.usedValue - totals.spareUsedValue,
  );

  return {
    projectId,
    projectName,
    lines: sorted,
    totals,
  };
}

export function projectsWithWarehouseActivity(
  projects: Project[],
  state: WarehouseState,
  holdingProjectId: string | null,
): Project[] {
  const activeIds = new Set<string>();
  for (const b of state.balances) {
    if (b.location.type === "project" && b.location.projectId) {
      activeIds.add(b.location.projectId);
    }
  }
  for (const m of state.movements) {
    if (m.to?.type === "project" && m.to.projectId) {
      activeIds.add(m.to.projectId);
    }
    if (m.from?.type === "project" && m.from.projectId) {
      activeIds.add(m.from.projectId);
    }
  }
  for (const lot of state.lots) {
    if (lot.purchaseProjectId) activeIds.add(lot.purchaseProjectId);
  }

  return projects
    .filter((p) => {
      if (p.isWarehouseHolding || p.id === holdingProjectId) return false;
      return activeIds.has(p.id);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
