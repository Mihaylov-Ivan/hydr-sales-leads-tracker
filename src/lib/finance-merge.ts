/**
 * Merge Excel actuals/expected with project summary fields.
 *
 * When an import is loaded: Excel rows plus any app-entered schedules
 * (e.g. from the project Gantt) so both appear on portfolio charts.
 */

import {
  FinanceImportData,
  expectedSchedulesForProject,
  isFileOwnedFinanceId,
  projectActualExpensesFromImport,
  projectActualPaymentsFromImport,
  projectMilestonesFromImport,
} from "./finance-import";
import {
  Project,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  todayDate,
} from "./types";

function appOwnedPayments(payments: ProjectPayment[]): ProjectPayment[] {
  return payments.filter((p) => !isFileOwnedFinanceId(p.id));
}

function appOwnedExpenses(
  expenses: ProjectExpenseItem[],
): ProjectExpenseItem[] {
  return expenses.filter((e) => !isFileOwnedFinanceId(e.id));
}

function appOwnedMilestones(
  milestones: ProjectMilestone[],
): ProjectMilestone[] {
  return milestones.filter((m) => !isFileOwnedFinanceId(m.id));
}

/**
 * Effective financials for display / planning.
 * - With import: Excel actuals + Excel expected + app-entered Gantt schedules
 * - Without import: app-entered schedules only
 */
export function mergeProjectFinancials(
  project: Project,
  importData: FinanceImportData | null,
  _today: string = todayDate(),
): ProjectFinancials {
  const f = project.financials;
  if (!importData) {
    return {
      ...f,
      payments: appOwnedPayments(f.payments ?? []),
      expenseSchedule: appOwnedExpenses(f.expenseSchedule ?? []),
      milestones: appOwnedMilestones(f.milestones ?? []),
    };
  }

  const importedPay = projectActualPaymentsFromImport(
    importData,
    project.id,
    project.name,
  );
  const importedExp = projectActualExpensesFromImport(
    importData,
    project.id,
    project.name,
  );
  const fileExpected = expectedSchedulesForProject(
    importData,
    project.id,
    project.name,
  );
  const importedMs = projectMilestonesFromImport(
    importData,
    project.id,
    project.name,
  );

  const importPayIds = new Set([
    ...importedPay.map((p) => p.id),
    ...fileExpected.payments.map((p) => p.id),
  ]);
  const importExpIds = new Set([
    ...importedExp.map((e) => e.id),
    ...fileExpected.expenses.map((e) => e.id),
  ]);

  return {
    ...f,
    payments: [
      ...importedPay,
      ...fileExpected.payments,
      ...appOwnedPayments(f.payments ?? []).filter((p) => !importPayIds.has(p.id)),
    ],
    expenseSchedule: [
      ...importedExp,
      ...fileExpected.expenses,
      ...appOwnedExpenses(f.expenseSchedule ?? []).filter(
        (e) => !importExpIds.has(e.id),
      ),
    ],
    milestones:
      importedMs.length > 0
        ? importedMs
        : appOwnedMilestones(f.milestones ?? []),
  };
}

export function projectsWithMergedFinancials(
  projects: Project[],
  importData: FinanceImportData | null,
  today: string = todayDate(),
): Project[] {
  return projects.map((p) => ({
    ...p,
    financials: mergeProjectFinancials(p, importData, today),
  }));
}

export function companyIncomeByMonth(
  _importData: FinanceImportData | null,
): Map<string, number> {
  return new Map();
}
