/**
 * Shared formatting helpers.
 * Change-history owns event ids / CRM summaries; this module re-exports
 * them so existing call sites keep a stable import path.
 */

export {
  createEventId,
  formatValue,
  summarizeCrmProjectPatch,
  summarizeFinancialFieldChange,
} from "./change-history";
