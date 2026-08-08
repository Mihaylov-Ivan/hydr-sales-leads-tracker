import {
  WarehouseBom,
  WarehouseBomLine,
  WarehouseBomLineInput,
  WarehouseBomSaveInput,
  WarehouseState,
} from "./types";
import { roundMoney } from "./warehouse";
import { ProjectPartLine, ProjectWarehouseMetrics } from "./warehouse-metrics";

export type BomWithLines = WarehouseBom & {
  lines: WarehouseBomLine[];
  estimatedMaterialCost: number;
};

export function isUserOwnedBomSourceKey(sourceKey: string): boolean {
  return (
    sourceKey.startsWith("manual:") || sourceKey.startsWith("override:")
  );
}

/** MoneyWorks source key overridden by a local edit, if any. */
export function overriddenImportSourceKey(
  sourceKey: string,
): string | null {
  if (!sourceKey.startsWith("override:")) return null;
  const original = sourceKey.slice("override:".length).trim();
  return original || null;
}

/**
 * Keep user-created / user-edited BOMs when MoneyWorks import replaces inventory.
 */
export function mergeBomsAfterImport(
  prev: Pick<WarehouseState, "boms" | "bomLines">,
  imported: Pick<WarehouseState, "boms" | "bomLines">,
): Pick<WarehouseState, "boms" | "bomLines"> {
  const overrides = new Set<string>();
  for (const b of prev.boms) {
    const orig = overriddenImportSourceKey(b.sourceKey);
    if (orig) overrides.add(orig);
  }
  const importedBoms = imported.boms.filter(
    (b) => !overrides.has(b.sourceKey),
  );
  const importedBomIds = new Set(importedBoms.map((b) => b.id));
  const importedLines = imported.bomLines.filter((l) =>
    importedBomIds.has(l.bomId),
  );
  const localBoms = prev.boms.filter((b) =>
    isUserOwnedBomSourceKey(b.sourceKey),
  );
  const localBomIds = new Set(localBoms.map((b) => b.id));
  const localLines = prev.bomLines.filter((l) => localBomIds.has(l.bomId));
  return {
    boms: [...importedBoms, ...localBoms],
    bomLines: [...importedLines, ...localLines],
  };
}

export function bomLinesFor(
  state: WarehouseState,
  bomId: string,
): WarehouseBomLine[] {
  return state.bomLines
    .filter((l) => l.bomId === bomId)
    .slice()
    .sort(
      (a, b) =>
        a.position - b.position ||
        a.componentName.localeCompare(b.componentName),
    );
}

export function listBomsWithLines(state: WarehouseState): BomWithLines[] {
  return state.boms
    .map((bom) => {
      const lines = bomLinesFor(state, bom.id);
      const estimatedMaterialCost = roundMoney(
        lines.reduce(
          (sum, l) => sum + l.qtyPerUnit * (l.unitCost ?? 0),
          0,
        ),
      );
      return { ...bom, lines, estimatedMaterialCost };
    })
    .sort((a, b) => {
      const fa = (a.productFamily ?? "").localeCompare(b.productFamily ?? "");
      if (fa !== 0) return fa;
      return a.name.localeCompare(b.name);
    });
}

export type BomVsProjectLine = {
  componentName: string;
  componentGroup?: string;
  bomQty: number;
  usedQty: number;
  onHandQty: number;
  bomUnitCost?: number;
  varianceQty: number;
};

/**
 * Compare a BOM recipe to actual project warehouse usage.
 * Matches by catalog item id when possible, else by component name.
 */
export function compareBomToProject(
  bom: BomWithLines,
  metrics: ProjectWarehouseMetrics | null,
): BomVsProjectLine[] {
  if (!metrics) {
    return bom.lines.map((l) => ({
      componentName: l.componentName,
      ...(l.componentGroup ? { componentGroup: l.componentGroup } : {}),
      bomQty: l.qtyPerUnit,
      usedQty: 0,
      onHandQty: 0,
      ...(l.unitCost != null ? { bomUnitCost: l.unitCost } : {}),
      varianceQty: -l.qtyPerUnit,
    }));
  }

  const byItem = new Map<string, ProjectPartLine>();
  const byName = new Map<string, ProjectPartLine>();
  for (const line of metrics.lines) {
    byItem.set(line.itemId, line);
    byName.set(line.itemName.trim().toLowerCase(), line);
  }

  const out: BomVsProjectLine[] = [];
  const matchedProject = new Set<string>();

  for (const l of bom.lines) {
    const proj =
      (l.componentItemId ? byItem.get(l.componentItemId) : undefined) ??
      byName.get(l.componentName.trim().toLowerCase());
    if (proj) matchedProject.add(proj.itemId);
    const usedQty = proj?.usedQty ?? 0;
    const onHandQty = proj?.onHandQty ?? 0;
    out.push({
      componentName: l.componentName,
      ...(l.componentGroup ? { componentGroup: l.componentGroup } : {}),
      bomQty: l.qtyPerUnit,
      usedQty,
      onHandQty,
      ...(l.unitCost != null ? { bomUnitCost: l.unitCost } : {}),
      varianceQty: Math.round((usedQty - l.qtyPerUnit) * 1e4) / 1e4,
    });
  }

  for (const line of metrics.lines) {
    if (matchedProject.has(line.itemId)) continue;
    if (!(line.usedQty > 0 || line.onHandQty > 0)) continue;
    out.push({
      componentName: line.itemName,
      bomQty: 0,
      usedQty: line.usedQty,
      onHandQty: line.onHandQty,
      varianceQty: line.usedQty,
    });
  }

  return out.sort((a, b) => a.componentName.localeCompare(b.componentName));
}

function normalizeBomLines(
  bomId: string,
  lines: WarehouseBomLineInput[],
  now: string,
): WarehouseBomLine[] | { error: string } {
  const out: WarehouseBomLine[] = [];
  let position = 0;
  for (const raw of lines) {
    const componentName = raw.componentName.trim();
    if (!componentName) continue;
    const qty = Number(raw.qtyPerUnit);
    if (!(qty > 0) || !Number.isFinite(qty)) {
      return { error: `Invalid qty for “${componentName || "component"}”` };
    }
    position += 1;
    const line: WarehouseBomLine = {
      id: crypto.randomUUID(),
      bomId,
      position,
      componentName,
      qtyPerUnit: Math.round(qty * 1e6) / 1e6,
      createdAt: now,
    };
    const group = raw.componentGroup?.trim();
    if (group) line.componentGroup = group;
    const itemId = raw.componentItemId?.trim();
    if (itemId) line.componentItemId = itemId;
    if (
      raw.unitCost != null &&
      Number.isFinite(raw.unitCost) &&
      raw.unitCost >= 0
    ) {
      line.unitCost = roundMoney(raw.unitCost);
    }
    out.push(line);
  }
  if (out.length === 0) {
    return { error: "Add at least one component with qty > 0" };
  }
  return out;
}

export function buildSavedBom(
  input: WarehouseBomSaveInput,
  existing: WarehouseBom | null,
  catalogItemIds: Set<string>,
):
  | { ok: true; bom: WarehouseBom; lines: WarehouseBomLine[] }
  | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Recipe name is required" };

  if (input.outputItemId && !catalogItemIds.has(input.outputItemId)) {
    return { ok: false, error: "Output catalog item not found" };
  }
  for (const line of input.lines) {
    if (line.componentItemId && !catalogItemIds.has(line.componentItemId)) {
      return {
        ok: false,
        error: `Catalog item missing for “${line.componentName.trim() || "component"}”`,
      };
    }
  }

  const now = new Date().toISOString();
  const id = existing?.id ?? crypto.randomUUID();
  const linesResult = normalizeBomLines(id, input.lines, now);
  if ("error" in linesResult) return { ok: false, error: linesResult.error };

  let sourceKey: string;
  if (!existing) {
    sourceKey = `manual:${id}`;
  } else if (isUserOwnedBomSourceKey(existing.sourceKey)) {
    sourceKey = existing.sourceKey;
  } else {
    // Preserve edits across MoneyWorks re-import
    sourceKey = `override:${existing.sourceKey}`;
  }

  const bom: WarehouseBom = {
    id,
    name,
    sourceKey,
    qtyProduced:
      input.qtyProduced != null && Number.isFinite(input.qtyProduced)
        ? Math.max(0, input.qtyProduced)
        : (existing?.qtyProduced ?? 0),
    createdAt: existing?.createdAt ?? now,
  };
  const outputGroup = input.outputGroup?.trim();
  if (outputGroup) bom.outputGroup = outputGroup;
  const productFamily = input.productFamily?.trim();
  if (productFamily) bom.productFamily = productFamily;
  const outputItemId = input.outputItemId?.trim();
  if (outputItemId) bom.outputItemId = outputItemId;
  const notes = input.notes?.trim();
  if (notes) bom.notes = notes;

  const est = roundMoney(
    linesResult.reduce((s, l) => s + l.qtyPerUnit * (l.unitCost ?? 0), 0),
  );
  if (est > 0) bom.unitCost = est;

  return { ok: true, bom, lines: linesResult };
}
