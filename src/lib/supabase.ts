import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  Market,
  MilestoneKind,
  Project,
  ProjectComment,
  ProjectContact,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  ProjectTodo,
  Series,
  Stage,
  TodoKind,
  emptyFinancials,
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
  contract_value: number | null;
  contract_signed_date: string | null;
  expenses: number | null;
  expected_profit: number | null;
  created_at: string;
}

/** Shape of a row in public.project_comments */
export interface CommentRow {
  id: string;
  project_id: string;
  text: string;
  author: string;
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

/** Shape of a row in public.project_payments */
export interface PaymentRow {
  id: string;
  project_id: string;
  amount: number;
  percent: number | null;
  due_date: string;
  label: string | null;
  milestone_id: string | null;
  created_at: string;
}

export function paymentFromRow(row: PaymentRow): ProjectPayment {
  return {
    id: row.id,
    amount: row.amount,
    ...(row.percent != null ? { percent: row.percent } : {}),
    dueDate: row.due_date,
    ...(row.label ? { label: row.label } : {}),
    ...(row.milestone_id ? { milestoneId: row.milestone_id } : {}),
    createdAt: row.created_at,
  };
}

/** Shape of a row in public.project_milestones */
export interface MilestoneRow {
  id: string;
  project_id: string;
  kind: MilestoneKind;
  date: string;
  note: string | null;
  created_at: string;
}

export function milestoneFromRow(row: MilestoneRow): ProjectMilestone {
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at,
  };
}

export function commentFromRow(row: CommentRow): ProjectComment {
  return {
    id: row.id,
    text: row.text,
    author: row.author,
    createdAt: row.created_at,
    ...(row.stage_change ? { stageChange: row.stage_change } : {}),
  };
}

export function financialsFromParts(
  row: ProjectRow,
  payments: ProjectPayment[],
  milestones: ProjectMilestone[],
): ProjectFinancials {
  return {
    ...(row.contract_value != null ? { contractValue: row.contract_value } : {}),
    ...(row.contract_signed_date
      ? { contractSignedDate: row.contract_signed_date }
      : {}),
    ...(row.expenses != null ? { expenses: row.expenses } : {}),
    ...(row.expected_profit != null
      ? { expectedProfit: row.expected_profit }
      : {}),
    payments,
    milestones,
  };
}

export function projectFromRow(
  row: ProjectRow,
  comments: ProjectComment[],
  todos: ProjectTodo[],
  contacts: ProjectContact[],
  financials: ProjectFinancials = emptyFinancials(),
): Project {
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
    stage: row.stage,
    baseDescription: row.base_description,
    ...(row.ai_summary ? { aiSummary: row.ai_summary } : {}),
    comments,
    todos,
    contacts,
    financials,
    createdAt: row.created_at,
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
    contract_value: p.financials.contractValue ?? null,
    contract_signed_date: p.financials.contractSignedDate ?? null,
    expenses: p.financials.expenses ?? null,
    expected_profit: p.financials.expectedProfit ?? null,
    created_at: p.createdAt,
  };
}
