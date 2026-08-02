/**
 * Financial data source toggle (project payments/expenses + company cash settings).
 *
 * NEXT_PUBLIC_USE_DATABASE=true  → load financials from localStorage on boot
 * NEXT_PUBLIC_USE_DATABASE=false → start with empty financials; fill via
 *   Header “Import financial data” CSV (Supabase still loads projects/gantt/etc.)
 */
export const useStoredFinancialData =
  (process.env.NEXT_PUBLIC_USE_DATABASE ?? "true").toLowerCase() !== "false";
