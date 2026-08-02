import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  CompanyMetricsSettings,
  Market,
  Project,
  ProjectComment,
  ProjectContact,
  ProjectFile,
  ProjectFileKind,
  ProjectFinancials,
  ProjectTodo,
  Series,
  Stage,
  TeamMember,
  TodoKind,
  DEFAULT_EMAIL_REMINDER_DAYS,
  defaultMetricsSettings,
  emptyFinancials,
  normalizeStage,
} from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when the env vars are missing, in which case the store falls back
 * to localStorage so local dev still works without a database.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** Shape of a row in public.projects */
export interface ProjectRow {
  id: string;
  name: string;
  client: string;
  country: string;
  city: string;
  series: Series;
  market: Market;
  size_kw: number;
  stage: Stage;
  base_description: string;
  ai_summary: string | null;
  last_client_contact_at: string | null;
  email_reminder_days: number | null;
  email_reminder_enabled: boolean | null;
  lead_user_id: string | null;
  created_at: string;
  /** Pipeline metrics columns (migration-014); may be absent before migration */
  cold_lead_entered_at?: string | null;
  hot_lead_entered_at?: string | null;
  under_development_at?: string | null;
  commissioned_at?: string | null;
  cancelled_at?: string | null;
  last_meaningful_activity_at?: string | null;
  next_action_text?: string | null;
  next_action_due_at?: string | null;
  cancellation_reason?: string | null;
}

/** Shape of company_metrics_settings singleton (migration-015) */
export interface MetricsSettingsRow {
  id: number;
  stale_cold_days: number;
  stale_hot_days: number;
  stale_under_development_days: number;
  maturity_under_development_months: number;
  maturity_commissioned_months: number;
  healthy_conversion_probability: number;
  stale_recovery_probability: number;
  updated_at: string;
}

/** Shape of a row in public.project_comments */
export interface CommentRow {
  id: string;
  project_id: string;
  text: string;
  author: string;
  author_user_id: string | null;
  stage_change: Stage | null;
  created_at: string;
}

/** Shape of a row in public.project_todos */
export interface TodoRow {
  id: string;
  project_id: string;
  kind: TodoKind;
  text: string;
  answer: string | null;
  done: boolean;
  due_date: string | null;
  owner_user_id: string | null;
  created_at: string;
  done_at: string | null;
}

export function todoFromRow(row: TodoRow): ProjectTodo {
  return {
    id: row.id,
    // Rows created before the kinds feature have no kind column value
    kind: row.kind ?? "our-action",
    text: row.text,
    ...(row.answer ? { answer: row.answer } : {}),
    done: row.done,
    ...(row.due_date ? { dueDate: row.due_date } : {}),
    ...(row.owner_user_id ? { ownerUserId: row.owner_user_id } : {}),
    createdAt: row.created_at,
    ...(row.done_at ? { doneAt: row.done_at } : {}),
  };
}

/** Shape of a row in public.project_contacts */
export interface ContactRow {
  id: string;
  project_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  created_at: string;
}

export function contactFromRow(row: ContactRow): ProjectContact {
  return {
    id: row.id,
    ...(row.name ? { name: row.name } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.position ? { position: row.position } : {}),
    createdAt: row.created_at,
  };
}

/** Shape of a row in public.project_files */
export interface FileRow {
  id: string;
  project_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  kind: ProjectFileKind;
  note: string | null;
  storage_path: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export function fileFromRow(row: FileRow): ProjectFile {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type || "application/octet-stream",
    sizeBytes: row.size_bytes,
    kind: row.kind ?? "other",
    ...(row.note ? { note: row.note } : {}),
    storagePath: row.storage_path,
    ...(row.uploaded_by_user_id
      ? { uploadedByUserId: row.uploaded_by_user_id }
      : {}),
    ...(row.uploaded_by_name ? { uploadedByName: row.uploaded_by_name } : {}),
    createdAt: row.created_at,
  };
}

/** Shape of a row in public.team_members */
export interface TeamMemberRow {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export function teamMemberFromRow(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    ...(row.email ? { email: row.email } : {}),
  };
}

export function teamMemberToRow(member: TeamMember): Omit<TeamMemberRow, "created_at"> {
  return {
    id: member.id,
    name: member.name,
    email: member.email ?? null,
  };
}

export function commentFromRow(row: CommentRow): ProjectComment {
  return {
    id: row.id,
    text: row.text,
    author: row.author,
    ...(row.author_user_id ? { authorUserId: row.author_user_id } : {}),
    createdAt: row.created_at,
    ...(row.stage_change
      ? { stageChange: normalizeStage(row.stage_change) }
      : {}),
  };
}

function dateOnly(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback.slice(0, 10);
  return value.slice(0, 10);
}

function optionalDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

export function projectFromRow(
  row: ProjectRow,
  comments: ProjectComment[],
  todos: ProjectTodo[],
  contacts: ProjectContact[],
  financials: ProjectFinancials = emptyFinancials(),
  files: ProjectFile[] = [],
): Project {
  const createdAt = row.created_at;
  const createdDate = createdAt.slice(0, 10);
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    country: row.country,
    city: row.city,
    series: row.series,
    // Rows created before the markets feature have no market column value
    market: row.market ?? "Clean H2",
    sizeKw: row.size_kw,
    stage: normalizeStage(row.stage),
    baseDescription: row.base_description,
    ...(row.ai_summary ? { aiSummary: row.ai_summary } : {}),
    lastClientContactAt:
      row.last_client_contact_at ?? createdDate,
    emailReminderDays: row.email_reminder_days ?? DEFAULT_EMAIL_REMINDER_DAYS,
    emailReminderEnabled: row.email_reminder_enabled !== false,
    ...(row.lead_user_id ? { leadUserId: row.lead_user_id } : {}),
    coldLeadEnteredAt: dateOnly(row.cold_lead_entered_at, createdDate),
    ...(optionalDate(row.hot_lead_entered_at)
      ? { hotLeadEnteredAt: optionalDate(row.hot_lead_entered_at) }
      : {}),
    ...(optionalDate(row.under_development_at)
      ? { underDevelopmentAt: optionalDate(row.under_development_at) }
      : {}),
    ...(optionalDate(row.commissioned_at)
      ? { commissionedAt: optionalDate(row.commissioned_at) }
      : {}),
    ...(optionalDate(row.cancelled_at)
      ? { cancelledAt: optionalDate(row.cancelled_at) }
      : {}),
    lastMeaningfulActivityAt: dateOnly(
      row.last_meaningful_activity_at,
      row.last_client_contact_at ?? createdDate,
    ),
    ...(row.next_action_text?.trim()
      ? { nextActionText: row.next_action_text.trim() }
      : {}),
    ...(optionalDate(row.next_action_due_at)
      ? { nextActionDueAt: optionalDate(row.next_action_due_at) }
      : {}),
    ...(row.cancellation_reason?.trim()
      ? { cancellationReason: row.cancellation_reason.trim() }
      : {}),
    comments,
    todos,
    contacts,
    files,
    financials,
    createdAt,
  };
}

export function projectToRow(p: Project): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    client: p.client,
    country: p.country,
    city: p.city,
    series: p.series,
    market: p.market,
    size_kw: p.sizeKw,
    stage: p.stage,
    base_description: p.baseDescription,
    ai_summary: p.aiSummary ?? null,
    last_client_contact_at: p.lastClientContactAt,
    email_reminder_days: p.emailReminderDays,
    email_reminder_enabled: p.emailReminderEnabled,
    lead_user_id: p.leadUserId ?? null,
    created_at: p.createdAt,
    cold_lead_entered_at: p.coldLeadEnteredAt,
    hot_lead_entered_at: p.hotLeadEnteredAt ?? null,
    under_development_at: p.underDevelopmentAt ?? null,
    commissioned_at: p.commissionedAt ?? null,
    cancelled_at: p.cancelledAt ?? null,
    last_meaningful_activity_at: p.lastMeaningfulActivityAt,
    next_action_text: p.nextActionText ?? null,
    next_action_due_at: p.nextActionDueAt ?? null,
    cancellation_reason: p.cancellationReason ?? null,
  };
}

export function metricsSettingsFromRow(
  row: MetricsSettingsRow,
): CompanyMetricsSettings {
  return {
    staleColdDays: row.stale_cold_days,
    staleHotDays: row.stale_hot_days,
    staleUnderDevelopmentDays: row.stale_under_development_days,
    maturityUnderDevelopmentMonths: row.maturity_under_development_months,
    maturityCommissionedMonths: row.maturity_commissioned_months,
    healthyConversionProbability: Number(row.healthy_conversion_probability),
    staleRecoveryProbability: Number(row.stale_recovery_probability),
  };
}

export function metricsSettingsToRow(
  s: CompanyMetricsSettings,
): Omit<MetricsSettingsRow, "updated_at"> {
  return {
    id: 1,
    stale_cold_days: s.staleColdDays,
    stale_hot_days: s.staleHotDays,
    stale_under_development_days: s.staleUnderDevelopmentDays,
    maturity_under_development_months: s.maturityUnderDevelopmentMonths,
    maturity_commissioned_months: s.maturityCommissionedMonths,
    healthy_conversion_probability: s.healthyConversionProbability,
    stale_recovery_probability: s.staleRecoveryProbability,
  };
}

export { defaultMetricsSettings };
