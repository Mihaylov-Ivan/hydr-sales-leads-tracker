import type { Project, ProjectExpenseItem, WarehouseLot, WarehouseState } from "./types";
import { normalizeProjectExpense } from "./types";

export type LinkProjectExpensesResult = {
  state: WarehouseState;
  projects: Project[];
  linkedLots: number;
  createdExpenseProjectNames: string[];
  projectCount: number;
};

function todayYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Earliest manufacture-materials envelope (not a dedicated 1:1 WH cash line). */
export function findFirstMaterialsExpense(
  schedule: ProjectExpenseItem[] | undefined,
): ProjectExpenseItem | null {
  const mats = (schedule ?? [])
    .map((e) => normalizeProjectExpense(e))
    .filter((e) => e.category === "materials" && !e.warehouseLotId)
    .sort((a, b) => {
      const byDue = a.dueDate.localeCompare(b.dueDate);
      if (byDue !== 0) return byDue;
      return a.createdAt.localeCompare(b.createdAt);
    });
  return mats[0] ?? null;
}

export function createMaterialsExpensePlaceholder(
  opts?: { dueDate?: string; label?: string; amount?: number },
): ProjectExpenseItem {
  const amount = opts?.amount != null && opts.amount > 0 ? opts.amount : 0;
  return {
    id: crypto.randomUUID(),
    amount,
    category: "materials",
    dueDate: opts?.dueDate ?? todayYmd(),
    label: opts?.label ?? "Manufacture materials (warehouse)",
    createdAt: new Date().toISOString(),
  };
}

/**
 * For lots with qty on a project slot: point lot.expenseId at that project's
 * first manufacture-materials expense (create one if missing).
 * Spare/buffer/holding stock is left untouched.
 */
export function linkProjectSlotLotsToMaterialsExpenses(
  projects: Project[],
  state: WarehouseState,
): LinkProjectExpensesResult {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const expenseByProject = new Map<string, string>();
  const createdExpenseProjectNames: string[] = [];
  let nextProjects = projects;

  const projectIdsWithStock = new Set<string>();
  for (const b of state.balances) {
    if (b.qty <= 0.0001) continue;
    if (b.location.slot !== "project" || !b.location.projectId) continue;
    projectIdsWithStock.add(b.location.projectId);
  }

  for (const projectId of projectIdsWithStock) {
    const project = projectById.get(projectId);
    if (!project) continue;

    let expense = findFirstMaterialsExpense(project.financials.expenseSchedule);
    if (!expense) {
      expense = createMaterialsExpensePlaceholder();
      createdExpenseProjectNames.push(project.name);
      nextProjects = nextProjects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          financials: {
            ...p.financials,
            expenseSchedule: [
              ...(p.financials.expenseSchedule ?? []),
              expense!,
            ],
          },
        };
      });
      projectById.set(projectId, nextProjects.find((p) => p.id === projectId)!);
    }
    expenseByProject.set(projectId, expense.id);
  }

  const lotToExpense = new Map<string, string>();
  for (const b of state.balances) {
    if (b.qty <= 0.0001) continue;
    if (b.location.slot !== "project" || !b.location.projectId) continue;
    const expenseId = expenseByProject.get(b.location.projectId);
    if (!expenseId) continue;
    lotToExpense.set(b.lotId, expenseId);
  }

  let linkedLots = 0;
  const lots: WarehouseLot[] = state.lots.map((lot) => {
    const expenseId = lotToExpense.get(lot.id);
    if (!expenseId) return lot;
    if (lot.expenseId === expenseId) return lot;
    linkedLots += 1;
    return { ...lot, expenseId };
  });

  return {
    state: { ...state, lots },
    projects: nextProjects,
    linkedLots,
    createdExpenseProjectNames,
    projectCount: expenseByProject.size,
  };
}
