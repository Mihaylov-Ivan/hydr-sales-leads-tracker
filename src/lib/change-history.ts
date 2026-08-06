/**
 * Helpers for app change events + financial history snapshots.
 * Postgres stores non-monetary events; amounts live only in financial history.
 */

import {
  ChangeEvent,
  ChangeEventDomain,
  FinancialHistoryEntry,
  STAGE_LABELS,
  Stage,
} from "./types";

export type RecordChangeInput = {
  id?: string;
  domain: ChangeEventDomain;
  entityType: string;
  entityId?: string;
  projectId?: string;
  action: string;
  field?: string;
  summary: string;
  payloadJson?: Record<string, unknown> | null;
  intentional: boolean;
  actorUserId?: string;
  actorName?: string;
  occurredAt?: string;
};

export type FinancialHistoryInput = {
  eventId: string;
  occurredAt: string;
  intentional: boolean;
  actorUserId?: string;
  actorName?: string;
  projectId?: string;
  projectName?: string;
  entityType: string;
  entityId?: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  summary: string;
};

/** DB row shape for `app_change_events` */
export type ChangeEventRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  intentional: boolean;
  domain: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  action: string;
  field: string | null;
  summary: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

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

export function buildChangeEvent(input: RecordChangeInput): ChangeEvent {
  const now = input.occurredAt ?? new Date().toISOString();
  return {
    id: input.id ?? createEventId(),
    occurredAt: now,
    intentional: input.intentional,
    domain: input.domain,
    entityType: input.entityType,
    action: input.action,
    summary: input.summary,
    createdAt: now,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.actorName ? { actorName: input.actorName } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.field ? { field: input.field } : {}),
    ...(input.payloadJson != null ? { payloadJson: input.payloadJson } : {}),
  };
}

export function buildFinancialHistoryEntry(
  input: FinancialHistoryInput,
): FinancialHistoryEntry {
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    intentional: input.intentional,
    entityType: input.entityType,
    action: input.action,
    summary: input.summary,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.actorName ? { actorName: input.actorName } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.projectName ? { projectName: input.projectName } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.field ? { field: input.field } : {}),
    ...(input.oldValue != null && input.oldValue !== ""
      ? { oldValue: input.oldValue }
      : {}),
    ...(input.newValue != null && input.newValue !== ""
      ? { newValue: input.newValue }
      : {}),
  };
}

export function changeEventToRow(event: ChangeEvent): ChangeEventRow {
  return {
    id: event.id,
    occurred_at: event.occurredAt,
    actor_user_id: event.actorUserId ?? null,
    actor_name: event.actorName ?? null,
    intentional: event.intentional,
    domain: event.domain,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    project_id: event.projectId ?? null,
    action: event.action,
    field: event.field ?? null,
    summary: event.summary,
    payload_json: event.payloadJson ?? null,
    created_at: event.createdAt,
  };
}

export function changeEventFromRow(row: ChangeEventRow): ChangeEvent | null {
  const domain = row.domain as ChangeEventDomain;
  if (
    domain !== "crm" &&
    domain !== "gantt" &&
    domain !== "finance_meta" &&
    domain !== "warehouse" &&
    domain !== "system"
  ) {
    return null;
  }
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    intentional: Boolean(row.intentional),
    domain,
    entityType: row.entity_type,
    action: row.action,
    summary: row.summary ?? "",
    createdAt: row.created_at ?? row.occurred_at,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.actor_name ? { actorName: row.actor_name } : {}),
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.field ? { field: row.field } : {}),
    ...(row.payload_json != null ? { payloadJson: row.payload_json } : {}),
  };
}

const CRM_TRACKED_FIELDS: {
  key: string;
  label: string;
  format?: (v: unknown) => string;
}[] = [
  { key: "name", label: "name" },
  { key: "client", label: "client" },
  { key: "market", label: "market" },
  { key: "series", label: "series" },
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

/** Summaries for tracked CRM field changes (main fields only). */
export function summarizeCrmProjectPatch(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  projectName: string,
): { field: string; summary: string; payload: Record<string, unknown> }[] {
  const out: {
    field: string;
    summary: string;
    payload: Record<string, unknown>;
  }[] = [];
  for (const def of CRM_TRACKED_FIELDS) {
    if (patch[def.key] === undefined) continue;
    const oldRaw = before[def.key];
    const newRaw = patch[def.key];
    if (String(oldRaw ?? "") === String(newRaw ?? "")) continue;
    const fmt = def.format ?? formatValue;
    const oldStr = fmt(oldRaw);
    const newStr = fmt(newRaw);
    out.push({
      field: def.label,
      summary: `${projectName}: ${def.label} ${oldStr || "—"} → ${newStr || "—"}`,
      payload: {
        field: def.label,
        old: oldStr || null,
        new: newStr || null,
      },
    });
  }
  return out;
}

export function summarizeFinancialFieldChange(
  projectName: string,
  field: string,
  oldValue: string,
  newValue: string,
): string {
  return `${projectName}: ${field} ${oldValue || "—"} → ${newValue || "—"}`;
}

/** Merge history entries by eventId (incoming wins on conflict). */
export function mergeFinancialHistory(
  existing: FinancialHistoryEntry[],
  incoming: FinancialHistoryEntry[],
): FinancialHistoryEntry[] {
  const byId = new Map<string, FinancialHistoryEntry>();
  for (const e of existing) byId.set(e.eventId, e);
  for (const e of incoming) byId.set(e.eventId, e);
  return Array.from(byId.values()).sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
}

export function sortChangeEventsDesc(events: ChangeEvent[]): ChangeEvent[] {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Convert legacy `project_stage_history` rows into CRM change events. */
export function changeEventsFromStageHistory(
  rows: {
    id: string;
    project_id: string;
    stage: string;
    entered_at: string;
  }[],
  projectNames: Map<string, string>,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (const row of rows) {
    const stage = row.stage as Stage;
    const label =
      stage in STAGE_LABELS ? STAGE_LABELS[stage] : row.stage;
    const name = projectNames.get(row.project_id) ?? row.project_id;
    const occurredAt = row.entered_at || new Date().toISOString();
    events.push(
      buildChangeEvent({
        id: row.id,
        domain: "crm",
        entityType: "project",
        entityId: row.project_id,
        projectId: row.project_id,
        action: "stage_change",
        field: "stage",
        summary: `${name}: entered ${label} (backfilled)`,
        payloadJson: { stage: row.stage, backfilled: true },
        intentional: true,
        actorName: "System",
        occurredAt,
      }),
    );
  }
  return events;
}
