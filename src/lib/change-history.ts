/**
 * Append-only change / process history for DB-backed, non-financial data.
 * Financial amount history (Excel/CSV) is intentionally deferred.
 */

import {
  ChangeEvent,
  ChangeEventDomain,
  STAGE_LABELS,
  Stage,
} from "./types";
import { supabase } from "./supabase";

/** Domains persisted to `app_change_events` today. */
export const PERSISTED_CHANGE_DOMAINS: ReadonlySet<ChangeEventDomain> = new Set([
  "crm",
  "gantt",
  "warehouse",
  "prospecting",
  "system",
]);

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
  intentional?: boolean;
  actorUserId?: string;
  actorName?: string;
  occurredAt?: string;
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

/** One side of a before/after history diff (scalar or field map). */
export type ChangeDiffSide = string | Record<string, unknown> | null;

export type ChangeDiff = {
  before: ChangeDiffSide;
  after: ChangeDiffSide;
  hasDiff: boolean;
};

const PAYLOAD_META_KEYS = new Set([
  "preview",
  "field",
  "reason",
  "old",
  "new",
  "before",
  "after",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDiffSide(value: unknown): ChangeDiffSide {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return formatValue(value);
  }
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return null;
    // Single nested string-ish value — flatten for readability.
    if (entries.length === 1) {
      const [, only] = entries[0]!;
      if (
        only == null ||
        typeof only === "string" ||
        typeof only === "number" ||
        typeof only === "boolean"
      ) {
        return Object.fromEntries(
          entries.map(([k, v]) => [k, v == null ? null : formatValue(v)]),
        );
      }
    }
    return value;
  }
  return formatValue(value);
}

function payloadWithoutMeta(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PAYLOAD_META_KEYS.has(k)) continue;
    if (v === undefined) continue;
    rest[k] = v;
  }
  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * Normalize history payloads into before/after for the admin details UI.
 * Supports `before`/`after`, `old`/`new`, `oldX`/`newX` pairs, and create/delete heuristics.
 */
export function extractChangeDiff(
  payload: Record<string, unknown> | null | undefined,
  action?: string,
): ChangeDiff {
  if (!payload || typeof payload !== "object") {
    return { before: null, after: null, hasDiff: false };
  }

  if ("before" in payload || "after" in payload) {
    return {
      before: normalizeDiffSide(payload.before),
      after: normalizeDiffSide(payload.after),
      hasDiff: true,
    };
  }

  if ("old" in payload || "new" in payload) {
    const field = typeof payload.field === "string" ? payload.field : null;
    if (field) {
      return {
        before: { [field]: payload.old ?? null },
        after: { [field]: payload.new ?? null },
        hasDiff: true,
      };
    }
    return {
      before: normalizeDiffSide(payload.old),
      after: normalizeDiffSide(payload.new),
      hasDiff: true,
    };
  }

  // oldFoo / newFoo (or fooBefore / fooAfter) field pairs
  const pairedBefore: Record<string, unknown> = {};
  const pairedAfter: Record<string, unknown> = {};
  let paired = false;
  for (const key of Object.keys(payload)) {
    const oldMatch = /^old([A-Z].*)$/.exec(key);
    if (oldMatch) {
      const field =
        oldMatch[1]!.charAt(0).toLowerCase() + oldMatch[1]!.slice(1);
      const newKey = `new${oldMatch[1]}`;
      pairedBefore[field] = payload[key] ?? null;
      pairedAfter[field] =
        newKey in payload ? (payload[newKey] ?? null) : null;
      paired = true;
      continue;
    }
    const beforeMatch = /^(.+)Before$/.exec(key);
    if (beforeMatch) {
      const field = beforeMatch[1]!;
      const afterKey = `${field}After`;
      pairedBefore[field] = payload[key] ?? null;
      pairedAfter[field] =
        afterKey in payload ? (payload[afterKey] ?? null) : null;
      paired = true;
    }
  }
  if (paired) {
    return {
      before: Object.keys(pairedBefore).length ? pairedBefore : null,
      after: Object.keys(pairedAfter).length ? pairedAfter : null,
      hasDiff: true,
    };
  }

  const rest = payloadWithoutMeta(payload);
  const preview =
    typeof payload.preview === "string" ? payload.preview : null;
  const actionKey = (action ?? "").toLowerCase();

  if (
    actionKey.includes("create") ||
    actionKey.includes("add") ||
    actionKey === "import" ||
    actionKey === "receive" ||
    actionKey === "seed"
  ) {
    return {
      before: null,
      after: rest ?? (preview ? preview : null),
      hasDiff: Boolean(rest || preview),
    };
  }

  if (
    actionKey.includes("delete") ||
    actionKey.includes("remove") ||
    actionKey === "void"
  ) {
    return {
      before: rest ?? (preview ? preview : null),
      after: null,
      hasDiff: Boolean(rest || preview),
    };
  }

  // Updates / completes / etc.: treat remaining payload as the after state.
  if (rest || preview) {
    return {
      before: null,
      after: rest ?? preview,
      hasDiff: true,
    };
  }

  return { before: null, after: null, hasDiff: false };
}

/** Pretty-print one side of a before/after diff for the UI. */
export function formatChangeDiffSide(side: ChangeDiffSide): string {
  if (side == null || side === "") return "—";
  if (typeof side === "string") return side;
  try {
    return JSON.stringify(side, null, 2);
  } catch {
    return String(side);
  }
}

/** Build a standard before/after payload (also mirrors old/new for simple scalars). */
export function changeDiffPayload(
  before: unknown,
  after: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    before: before ?? null,
    after: after ?? null,
    ...(extra ?? {}),
  };
  const beforeScalar =
    before == null ||
    typeof before === "string" ||
    typeof before === "number" ||
    typeof before === "boolean";
  const afterScalar =
    after == null ||
    typeof after === "string" ||
    typeof after === "number" ||
    typeof after === "boolean";
  if (beforeScalar && afterScalar) {
    payload.old = before == null ? null : formatValue(before);
    payload.new = after == null ? null : formatValue(after);
  }
  return payload;
}

export function buildChangeEvent(input: RecordChangeInput): ChangeEvent {
  const now = input.occurredAt ?? new Date().toISOString();
  return {
    id: input.id ?? createEventId(),
    occurredAt: now,
    intentional: input.intentional ?? true,
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
    domain !== "prospecting" &&
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

export function sortChangeEventsDesc(events: ChangeEvent[]): ChangeEvent[] {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
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
      payload: changeDiffPayload(oldStr || null, newStr || null, {
        field: def.label,
      }),
    });
  }
  return out;
}

/** Kept for call-site compatibility; financial history persistence is deferred. */
export function summarizeFinancialFieldChange(
  projectName: string,
  field: string,
  oldValue: string,
  newValue: string,
): string {
  return `${projectName}: ${field} ${oldValue || "—"} → ${newValue || "—"}`;
}

function logChangeHistoryError(action: string, message: string) {
  console.error(`Change history ${action} failed:`, message);
}

/**
 * Insert a change event into Postgres.
 * Skips finance_meta (deferred) and no-ops when Supabase is unavailable.
 */
export function persistChangeEventRemote(event: ChangeEvent): void {
  if (!PERSISTED_CHANGE_DOMAINS.has(event.domain)) return;
  const client = supabase;
  if (!client) return;

  const row = changeEventToRow(event);
  void client
    .from("app_change_events")
    .insert(row)
    .then(async ({ error }) => {
      // Project create races: event can arrive before projects row. Retry without FK.
      if (
        error &&
        row.project_id &&
        /app_change_events_project_id_fkey/i.test(error.message)
      ) {
        const { project_id: _drop, ...rest } = row;
        void client
          .from("app_change_events")
          .insert({ ...rest, project_id: null })
          .then(({ error: retryError }) => {
            if (retryError) {
              logChangeHistoryError(
                "insert (no project_id)",
                retryError.message,
              );
            }
          });
        return;
      }
      if (error) logChangeHistoryError("insert", error.message);
    });
}

/** Build + optionally persist a change event (shared by CRM / prospecting stores). */
export function recordPersistedChange(
  input: RecordChangeInput,
  options?: { skipRemote?: boolean },
): ChangeEvent {
  const event = buildChangeEvent(input);
  if (!options?.skipRemote) {
    try {
      persistChangeEventRemote(event);
    } catch (e) {
      logChangeHistoryError(
        "persist",
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return event;
}

/** Query helpers for the admin history UI. */
export async function fetchChangeEvents(options?: {
  limit?: number;
  offset?: number;
  domain?: ChangeEventDomain;
  /** When set, only these domains (overrides `domain`). */
  domains?: ChangeEventDomain[];
  projectId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Case-insensitive substring match on summary. */
  search?: string;
  /** Inclusive lower bound on occurred_at (ISO). */
  since?: string;
  /** Inclusive upper bound on occurred_at (ISO). */
  until?: string;
}): Promise<ChangeEvent[]> {
  if (!supabase) return [];

  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const offset = Math.max(options?.offset ?? 0, 0);

  let query = supabase
    .from("app_change_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.domains && options.domains.length > 0) {
    query = query.in("domain", options.domains);
  } else if (options?.domain) {
    query = query.eq("domain", options.domain);
  }
  if (options?.projectId) query = query.eq("project_id", options.projectId);
  if (options?.actorUserId)
    query = query.eq("actor_user_id", options.actorUserId);
  if (options?.entityType) query = query.eq("entity_type", options.entityType);
  if (options?.entityId) query = query.eq("entity_id", options.entityId);
  if (options?.since) query = query.gte("occurred_at", options.since);
  if (options?.until) query = query.lte("occurred_at", options.until);
  const search = options?.search?.trim();
  if (search) query = query.ilike("summary", `%${search}%`);

  const { data, error } = await query;
  if (error || !data) {
    if (error) logChangeHistoryError("fetch", error.message);
    return [];
  }

  const events: ChangeEvent[] = [];
  for (const row of data as ChangeEventRow[]) {
    const ev = changeEventFromRow(row);
    if (ev) events.push(ev);
  }
  return sortChangeEventsDesc(events);
}

export const CHANGE_EVENT_DOMAIN_LABELS: Record<ChangeEventDomain, string> = {
  crm: "CRM",
  gantt: "Gantt",
  warehouse: "Warehouse",
  prospecting: "Prospecting",
  system: "System",
  finance_meta: "Finance",
};

export const CHANGE_EVENT_ENTITY_LABELS: Record<string, string> = {
  project: "Project",
  comment: "Comment / update",
  todo: "To-do",
  personal_todo: "Personal to-do",
  contact: "Contact",
  file: "File",
  gantt_phase: "Gantt phase",
  gantt_activity: "Gantt activity",
  gantt_deadline: "Gantt deadline",
  metrics_settings: "Metrics settings",
  holding_project: "WH holding project",
  lot: "Warehouse lot",
  bom: "BOM",
  sklad_map: "SKLAD map",
  expense_link: "Expense link",
  prospect_company: "Prospect company",
  prospect_contact: "Prospect contact",
  prospect_activity: "Prospect outreach",
  prospecting_targets: "Prospecting targets",
};

export function labelForChangeEntity(entityType: string): string {
  return CHANGE_EVENT_ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ");
}
