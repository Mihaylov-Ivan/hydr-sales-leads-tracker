/**
 * Merge Excel actuals/expected with project summary fields.
 *
 * When an import is loaded, schedule lines come only from the file
 * (actuals + expected). App-entered payment/expense schedules are hidden
 * so they cannot appear alongside Excel rows.
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
 * - With import: Excel actuals + Excel expected only (local schedules ignored)
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

  return {
    ...f,
    payments: [...importedPay, ...fileExpected.payments],
    expenseSchedule: [...importedExp, ...fileExpected.expenses],
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
