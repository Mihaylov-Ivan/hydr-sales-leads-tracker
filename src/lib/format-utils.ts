import { STAGE_LABELS, Stage } from "./types";

export function createEventId(): string {
  return crypto.randomUUID();
}

export function formatValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

const CRM_TRACKED_FIELDS: {
  key: string;
  label: string;
  format?: (v: unknown) => string;
}[] = [
  { key: "name", label: "name" },
  { key: "client", label: "client" },
  { key: "series", label: "series" },
  { key: "market", label: "market" },
  { key: "sizeKw", label: "size_kw" },
  { key: "leadUserId", label: "lead" },
  {
    key: "stage",
    label: "stage",
    format: (v) =>
      typeof v === "string" && v in STAGE_LABELS
        ? STAGE_LABELS[v as Stage]
        : formatValue(v),
  },
  { key: "country", label: "country" },
  { key: "city", label: "city" },
];

export function summarizeFinancialFieldChange(
  projectName: string,
  field: string,
  oldValue: string,
  newValue: string,
): string {
  return `${projectName}: ${field} ${oldValue || "—"} → ${newValue || "—"}`;
}

/** @deprecated History tracking removed — kept for call-site compatibility. */
export function summarizeCrmProjectPatch(
  _before: Record<string, unknown>,
  _patch: Record<string, unknown>,
  _projectName: string,
): { field: string; summary: string; payload: Record<string, unknown> }[] {
  return [];
}
