import { Project, WarehouseState } from "./types";
import { roundMoney } from "./warehouse";
import {
  buildProjectWarehouseMetrics,
  projectsWithWarehouseActivity,
} from "./warehouse-metrics";

export const MFG_COST_REFERENCE_STORAGE_KEY =
  "hydrogenera-mfg-cost-reference-project";

export type ManufacturingProjectCostRow = {
  projectId: string;
  projectName: string;
  series: string;
  sizeKw: number;
  /** Distinct catalog components with used qty > 0 */
  componentCount: number;
  usedQty: number;
  totalCostIncVat: number;
  constructionCostIncVat: number;
};

export type ManufacturingSeriesSizeStat = {
  key: string;
  series: string;
  sizeKw: number;
  projectCount: number;
  totalComponents: number;
  avgCostIncVat: number;
  minCostIncVat: number;
  maxCostIncVat: number;
  projects: ManufacturingProjectCostRow[];
};

export function loadManufacturingCostReferenceProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(MFG_COST_REFERENCE_STORAGE_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function saveManufacturingCostReferenceProjectId(
  projectId: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!projectId) {
      window.localStorage.removeItem(MFG_COST_REFERENCE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MFG_COST_REFERENCE_STORAGE_KEY, projectId);
    }
  } catch {
    // ignore
  }
}

export function buildManufacturingProjectCosts(
  projects: Project[],
  warehouse: WarehouseState,
): ManufacturingProjectCostRow[] {
  const active = projectsWithWarehouseActivity(
    projects,
    warehouse,
    warehouse.holdingProjectId,
  );
  const rows: ManufacturingProjectCostRow[] = [];

  for (const p of active) {
    if (p.isWarehouseHolding) continue;
    const metrics = buildProjectWarehouseMetrics(p.id, p.name, warehouse);
    if (!(metrics.totals.usedQty > 0 || metrics.totals.usedValue > 0)) continue;
    const componentCount = metrics.lines.filter((l) => l.usedQty > 0).length;
    rows.push({
      projectId: p.id,
      projectName: p.name,
      series: p.series || "—",
      sizeKw: Number.isFinite(p.sizeKw) ? p.sizeKw : 0,
      componentCount,
      usedQty: metrics.totals.usedQty,
      totalCostIncVat: metrics.totals.usedValue,
      constructionCostIncVat: metrics.totals.constructionValue,
    });
  }

  return rows.sort((a, b) => {
    const bySeries = a.series.localeCompare(b.series);
    if (bySeries !== 0) return bySeries;
    if (a.sizeKw !== b.sizeKw) return a.sizeKw - b.sizeKw;
    return a.projectName.localeCompare(b.projectName);
  });
}

export function buildManufacturingSeriesSizeStats(
  rows: ManufacturingProjectCostRow[],
): ManufacturingSeriesSizeStat[] {
  const map = new Map<string, ManufacturingProjectCostRow[]>();
  for (const row of rows) {
    const key = `${row.series}||${row.sizeKw}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const out: ManufacturingSeriesSizeStat[] = [];
  for (const [key, list] of map) {
    const costs = list.map((r) => r.totalCostIncVat);
    const sum = costs.reduce((s, n) => s + n, 0);
    out.push({
      key,
      series: list[0]!.series,
      sizeKw: list[0]!.sizeKw,
      projectCount: list.length,
      totalComponents: list.reduce((s, r) => s + r.componentCount, 0),
      avgCostIncVat: roundMoney(sum / list.length),
      minCostIncVat: roundMoney(Math.min(...costs)),
      maxCostIncVat: roundMoney(Math.max(...costs)),
      projects: list,
    });
  }

  return out.sort((a, b) => {
    const bySeries = a.series.localeCompare(b.series);
    if (bySeries !== 0) return bySeries;
    return a.sizeKw - b.sizeKw;
  });
}

export function formatSystemSizeKw(sizeKw: number): string {
  if (!(sizeKw > 0)) return "—";
  if (sizeKw >= 1000 && sizeKw % 1000 === 0) return `${sizeKw / 1000} MW`;
  if (sizeKw >= 1000) return `${(sizeKw / 1000).toFixed(2).replace(/\.?0+$/, "")} MW`;
  return `${sizeKw} kW`;
}
