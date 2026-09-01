/** Keys that must never hold financial overlays — data comes from Supabase / CSV only. */
export const FINANCIAL_LOCAL_STORAGE_KEYS = [
  "hydrogenera-finance-settings-v1",
  "hydrogenera-finance-import-v1",
  "hydrogenera-project-financials-v1",
  "hydrogenera-financial-history-v1",
  "hydrogenera-change-events-v1",
  "hydrogenera-meaningful-change-v1",
  "hydrogenera-warehouse-v2",
] as const;

/** Drop legacy financial / audit blobs so only DB-backed state is used. */
export function purgeFinancialLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of FINANCIAL_LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore private mode / blocked storage
  }
}
