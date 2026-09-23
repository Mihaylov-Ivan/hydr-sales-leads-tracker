"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import {
  STAGE_LABELS,
  TODO_KIND_LABELS,
  isInternalHiddenProject,
  stagesForTrack,
  trackOfProject,
  type Project,
  type Stage,
  type TeamMember,
  type TodoKind,
  type MilestoneKind,
  type PersonalTodoStatus,
  type ProjectExpenseCategory,
  type ScheduleShiftUnit,
  type WarehouseLocation,
  type WarehouseMaterialKind,
} from "@/lib/types";
import {
  assignableTeamMembers,
  type PermissionType,
} from "@/lib/permissions";
import type {
  OutreachChannel,
  OutreachResult,
  ProspectPriority,
  ProspectQualification,
  ProspectStatus,
} from "@/lib/prospecting-types";

type VoiceStatus =
  | "off"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "working";

type LogKind = "user" | "assistant" | "action" | "error";

interface LogEntry {
  id: string;
  kind: LogKind;
  text: string;
}

interface FunctionCallItem {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

interface RealtimeEvent {
  type?: string;
  error?: { message?: string };
  transcript?: string;
  delta?: string;
  item_id?: string;
  response?: {
    output?: Array<
      | FunctionCallItem
      | {
          type?: string;
          content?: Array<{ text?: string; transcript?: string }>;
        }
    >;
  };
}

const SALES_STAGE_VALUES: Stage[] = [
  "cold-lead",
  "hot-lead",
  "under-development",
  "commissioned",
  "cancelled",
  "eu-application-prep",
  "eu-application-submitted",
  "eu-project-started",
  "rnd-execution",
];

const CRM_TOOLS = [
  {
    type: "function",
    name: "search_projects",
    description:
      "Search CRM projects by project name, client, country, or city. Use this before acting on a project unless an exact project_id was already resolved earlier in this conversation.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural project/client search text, for example 'DW', 'Volkswagen', or 'BA Glass Sofia'.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_project",
    description:
      "Read the current CRM details, latest updates, and open tasks for one already-resolved project.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
      },
      required: ["project_id"],
    },
  },
  {
    type: "function",
    name: "search_team_members",
    description:
      "Find assignable CRM team members by name, username, or email. Always use this when the user names an assignee and you do not already have that person's exact user id from this conversation.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Person name, username, or email fragment.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "add_project_comment",
    description:
      "Add a factual update/comment to a CRM project. May also change the project stage if the user explicitly asked for that stage change.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        text: {
          type: "string",
          description:
            "The update to store. Preserve the user's facts; remove only conversational filler and do not invent details.",
        },
        stage_change: {
          type: "string",
          enum: SALES_STAGE_VALUES,
          description:
            "Optional exact CRM stage id. Only provide when the user explicitly requested or clearly stated the stage change.",
        },
      },
      required: ["project_id", "text"],
    },
  },
  {
    type: "function",
    name: "create_project_task",
    description:
      "Create a CRM action item or reminder on a project.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        text: { type: "string" },
        kind: {
          type: "string",
          enum: ["our-action"],
          description: "Always our-action. Kept for compatibility with older prompts.",
        },
        due_date: {
          type: "string",
          description:
            "Optional due date in YYYY-MM-DD. Convert relative dates using the user's local date before calling.",
        },
        owner_user_id: {
          type: "string",
          description:
            "Optional assignee id returned by search_team_members. Never invent this value.",
        },
      },
      required: ["project_id", "text"],
    },
  },
  {
    type: "function",
    name: "change_project_stage",
    description:
      "Move an already-resolved project to a different CRM stage when the user explicitly asks to change its stage.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        stage: {
          type: "string",
          enum: SALES_STAGE_VALUES,
        },
      },
      required: ["project_id", "stage"],
    },
  },
] as const;

const EXTENDED_CRM_TOOLS = [
  {
    type: "function",
    name: "get_portfolio_update",
    description:
      "Return concise current-state and latest-activity data for all CRM projects the signed-in user may access, or only selected projects. Use this for requests such as 'give me an update on all projects', 'what happened lately', summaries, and bullet-point status reports.",
    parameters: {
      type: "object",
      properties: {
        project_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional exact project ids already resolved by search_projects. Omit to summarize all accessible projects.",
        },
        query: {
          type: "string",
          description:
            "Optional name/client filter when the user asked about a subset but exact ids are not yet known.",
        },
        days: {
          type: "integer",
          description:
            "Optional recent-activity window in days. Omit to include the latest activity regardless of age.",
        },
        limit: {
          type: "integer",
          description: "Maximum projects to return. Defaults to 60.",
        },
      },
    },
  },
  {
    type: "function",
    name: "create_project",
    description:
      "Create a new Sales, EU, or RnD project when the signed-in user has access to that track. Ask only for genuinely required missing fields. Project name, client/organisation, and country are required.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        client: { type: "string" },
        country: { type: "string" },
        city: { type: "string" },
        series: { type: "string" },
        market: { type: "string" },
        size_kw: { type: "number" },
        stage: { type: "string", enum: SALES_STAGE_VALUES },
        description: { type: "string" },
        lead_user_id: { type: "string" },
        track: { type: "string", enum: ["sales", "eu", "rnd"] },
      },
      required: ["name", "client", "country"],
    },
  },
  {
    type: "function",
    name: "update_project_fields",
    description:
      "Edit project fields and pipeline-activity dates. Use only after resolving the project. Supports name/client/location/system/market/size/stage/description/lead and pipeline timestamps or cancellation reason.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        name: { type: "string" },
        client: { type: "string" },
        country: { type: "string" },
        city: { type: "string" },
        series: { type: "string" },
        market: { type: "string" },
        size_kw: { type: "number" },
        stage: { type: "string", enum: SALES_STAGE_VALUES },
        description: { type: "string" },
        lead_user_id: { type: ["string", "null"] },
        last_client_contact_at: { type: "string" },
        email_reminder_days: { type: "integer" },
        email_reminder_enabled: { type: "boolean" },
        cold_lead_entered_at: { type: "string" },
        hot_lead_entered_at: { type: ["string", "null"] },
        under_development_at: { type: ["string", "null"] },
        commissioned_at: { type: ["string", "null"] },
        cancelled_at: { type: ["string", "null"] },
        last_meaningful_activity_at: { type: "string" },
        cancellation_reason: { type: ["string", "null"] },
      },
      required: ["project_id"],
    },
  },
  {
    type: "function",
    name: "manage_project_task",
    description:
      "Create, update, complete/reopen, or delete an action item on a resolved project.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "complete", "reopen", "delete"],
        },
        project_id: { type: "string" },
        task_id: { type: "string" },
        text: { type: "string" },
        answer: { type: ["string", "null"] },
        due_date: { type: ["string", "null"] },
        start_date: { type: ["string", "null"] },
        end_date: { type: ["string", "null"] },
        owner_user_id: { type: ["string", "null"] },
      },
      required: ["action", "project_id"],
    },
  },
  {
    type: "function",
    name: "manage_project_contact",
    description:
      "Add, edit, or delete a contact attached to a resolved project.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "update", "delete"] },
        project_id: { type: "string" },
        contact_id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        position: { type: "string" },
      },
      required: ["action", "project_id"],
    },
  },
  {
    type: "function",
    name: "manage_personal_todo",
    description:
      "Read or manage the signed-in user's private To-Dos. Personal To-Dos are not project tasks.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "delete", "add_comment"],
        },
        todo_id: { type: "string" },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        status: {
          type: "string",
          enum: ["cancelled", "todo", "doing", "done"],
        },
        due_date: { type: ["string", "null"] },
        start_date: { type: ["string", "null"] },
        end_date: { type: ["string", "null"] },
        comment: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    type: "function",
    name: "search_prospects",
    description:
      "Search prospecting companies and contacts by company name, contact name, email, industry, country, city, or notes.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_prospect",
    description:
      "Read one resolved prospect company, its contacts, recent outreach/activity, qualification, and next action.",
    parameters: {
      type: "object",
      properties: { company_id: { type: "string" } },
      required: ["company_id"],
    },
  },
  {
    type: "function",
    name: "manage_prospect",
    description:
      "Create/edit/delete prospect companies and contacts, log outreach, schedule follow-up, mark engaged/qualified, or promote a prospect into Sales Projects. Ask for missing information naturally before calling.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create_company",
            "update_company",
            "delete_company",
            "add_contact",
            "update_contact",
            "delete_contact",
            "log_outreach",
            "schedule_follow_up",
            "mark_engaged",
            "mark_qualified",
            "promote_to_project"
          ],
        },
        company_id: { type: "string" },
        contact_id: { type: "string" },
        name: { type: "string" },
        contact_name: { type: "string" },
        country: { type: "string" },
        city: { type: "string" },
        site_name: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        market: { type: "string" },
        system: { type: "string" },
        source: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        owner_user_id: { type: "string" },
        notes: { type: "string" },
        size_kw: { type: "number" },
        potential_value: { type: ["number", "null"] },
        existing_relationship: { type: "string" },
        next_action: { type: "string" },
        next_action_at: { type: ["string", "null"] },
        status: { type: "string" },
        title: { type: "string" },
        department: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        linkedin_url: { type: "string" },
        preferred_method: { type: "string" },
        is_primary: { type: "boolean" },
        channel: { type: "string" },
        result: { type: "string" },
        summary: { type: "string" },
        follow_up_at: { type: ["string", "null"] },
        qualification: { type: "object" },
        project_name: { type: "string" },
        project_stage: { type: "string", enum: SALES_STAGE_VALUES },
        project_description: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    type: "function",
    name: "manage_prospecting_strategy",
    description:
      "List, create, edit, or delete Prospecting strategies and their weekly contact targets.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create", "update", "delete"] },
        strategy_id: { type: "string" },
        name: { type: "string" },
        markets: { type: "array", items: { type: "string" } },
        industries: { type: "string" },
        weekly_contact_target: { type: "integer" },
        is_active: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    type: "function",
    name: "manage_project_finance",
    description:
      "Read or edit project financial data, payments, expenses, and financial milestones. This tool is only available when the signed-in user has the same finance access the UI grants for that project.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "get",
            "update_summary",
            "add_payment",
            "generate_incomes_from_schedule",
            "generate_opex_schedule",
            "update_payment",
            "delete_payment",
            "add_expense",
            "generate_material_expenses_from_incomes",
            "update_expense",
            "delete_expense",
            "add_milestone",
            "update_milestone",
            "delete_milestone"
          ],
        },
        project_id: { type: "string" },
        record_id: { type: "string" },
        contract_value: { type: ["number", "null"] },
        contract_signed_date: { type: ["string", "null"] },
        expenses_total: { type: ["number", "null"] },
        max_materials_expense: { type: ["number", "null"] },
        max_man_hr_expense: { type: ["number", "null"] },
        opex_value: { type: ["number", "null"] },
        opex_expense_percent: { type: ["number", "null"] },
        warranty_years: { type: ["number", "null"] },
        system_lifetime_years: { type: ["number", "null"] },
        amount: { type: "number" },
        amount_ex_vat: { type: ["number", "null"] },
        percent: { type: ["number", "null"] },
        due_date: { type: "string" },
        actual_date: { type: ["string", "null"] },
        label: { type: "string" },
        milestone_id: { type: ["string", "null"] },
        category: {
          type: "string",
          enum: ["man-hr", "materials", "installation", "maintenance", "admin"],
        },
        subcategory: { type: ["string", "null"] },
        milestone_kind: {
          type: "string",
          enum: [
            "contract-signed",
            "engineering-done",
            "manufacturing-done",
            "fat",
            "sat",
            "commissioned"
          ],
        },
        milestone_date: { type: "string" },
        note: { type: "string" },
      },
      required: ["action", "project_id"],
    },
  },
  {
    type: "function",
    name: "manage_gantt",
    description:
      "Read, create, edit, delete, or shift a project's Gantt phases, activities, and deadlines. Gantt permissions mirror the project page; production-only users may read schedules but not edit them.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "get",
            "add_phase",
            "update_phase",
            "delete_phase",
            "add_activity",
            "update_activity",
            "delete_activity",
            "add_deadline",
            "update_deadline",
            "delete_deadline",
            "shift_schedule"
          ],
        },
        project_id: { type: "string" },
        record_id: { type: "string" },
        phase_id: { type: "string" },
        name: { type: "string" },
        start_date: { type: "string" },
        duration_days: { type: "integer" },
        actual_start_date: { type: ["string", "null"] },
        actual_duration_days: { type: ["integer", "null"] },
        date: { type: "string" },
        actual_date: { type: ["string", "null"] },
        wbs: { type: "string" },
        owner: { type: "string" },
        status: { type: "string" },
        note: { type: "string" },
        sort_order: { type: "integer" },
        amount: { type: "integer" },
        unit: { type: "string", enum: ["days", "weeks", "months"] },
        include_actuals: { type: "boolean" },
      },
      required: ["action", "project_id"],
    },
  },
  {
    type: "function",
    name: "manage_warehouse",
    description:
      "Read or change warehouse inventory for users with Warehouse permission. Supports stock receipt, transfer, consumption, adjustment, lot edits, catalog items/groups, and BOM recipes. Put operation-specific fields in payload.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "summary",
            "search_items",
            "receive_stock",
            "transfer_stock",
            "consume_stock",
            "adjust_stock",
            "update_lot",
            "delete_lot",
            "upsert_item",
            "upsert_group",
            "delete_group",
            "save_bom",
            "delete_bom"
          ],
        },
        query: { type: "string" },
        payload: {
          type: "object",
          description:
            "Operation data. Locations use {site:'ELX|MH|Van',slot:'project|spare|buffer',projectId?}. receive_stock expects itemId or newItem, qty, unitCostIncVat, receivedAt, materialKind, destination, expenseMode, and optional supplier/label/notes. transfer/consume/adjust use lotId/qty/location. save_bom uses name and lines [{componentName,componentItemId?,qtyPerUnit,unitCost?}].",
        },
      },
      required: ["action"],
    },
  },
  {
    type: "function",
    name: "manage_project_record",
    description:
      "Manage project-level records not covered by the other tools: edit/delete an existing update comment, regenerate the stored AI summary, read/update the signed-in user's follow-up reminder, edit/delete project file metadata, or explicitly delete a project. New binary file uploads still require the browser file picker.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "update_comment",
            "delete_comment",
            "regenerate_summary",
            "get_followup_reminder",
            "update_followup_reminder",
            "update_file_metadata",
            "delete_file",
            "delete_project"
          ],
        },
        project_id: { type: "string" },
        record_id: { type: "string" },
        text: { type: "string" },
        email_reminder_days: { type: "integer" },
        email_reminder_enabled: { type: "boolean" },
        last_client_contact_at: { type: "string" },
        file_kind: {
          type: "string",
          enum: ["offer", "financial-model", "other"],
        },
        note: { type: ["string", "null"] },
      },
      required: ["action", "project_id"],
    },
  },
  {
    type: "function",
    name: "manage_company_settings",
    description:
      "Read/update company finance settings or Sales pipeline metrics settings. Finance settings require Finance permission; metrics settings require Sales permission.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "get_finance",
            "update_finance",
            "get_metrics",
            "update_metrics"
          ],
        },
        payload: { type: "object" },
      },
      required: ["action"],
    },
  },
] as const;

const ALL_CRM_TOOLS = [...CRM_TOOLS, ...EXTENDED_CRM_TOOLS] as const;

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(query: string, project: Project): number {
  const q = normalizeSearch(query);
  if (!q) return 0;

  const name = normalizeSearch(project.name);
  const client = normalizeSearch(project.client);
  const place = normalizeSearch(`${project.city} ${project.country}`);
  const haystack = `${name} ${client} ${place}`.trim();

  let score = 0;
  if (name === q) score += 120;
  if (client === q) score += 110;
  if (name.startsWith(q)) score += 70;
  if (client.startsWith(q)) score += 65;
  if (name.includes(q)) score += 50;
  if (client.includes(q)) score += 45;
  if (place.includes(q)) score += 25;

  const tokens = q.split(/\s+/).filter(Boolean);
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  score += matchedTokens.length * 12;
  if (tokens.length > 1 && matchedTokens.length === tokens.length) score += 20;

  return score;
}

function teamMemberScore(query: string, member: TeamMember): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const name = normalizeSearch(member.name);
  const username = normalizeSearch(member.username ?? "");
  const email = normalizeSearch(member.email ?? "");
  const haystack = `${name} ${username} ${email}`;

  let score = 0;
  if (name === q || username === q || email === q) score += 100;
  if (name.startsWith(q) || username.startsWith(q)) score += 60;
  if (haystack.includes(q)) score += 40;
  const tokens = q.split(/\s+/).filter(Boolean);
  score += tokens.filter((token) => haystack.includes(token)).length * 10;
  return score;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function localDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nullableNumberValue(value: unknown): number | null | undefined {
  if (value === null) return null;
  return numberValue(value);
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function validOptionalDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return undefined;
  return isValidDateOnly(value.trim()) ? value.trim() : undefined;
}

function assistantTextFromResponse(event: RealtimeEvent): string | null {
  const output = event.response?.output ?? [];
  const parts: string[] = [];
  for (const item of output) {
    if (item.type === "function_call" || !("content" in item)) continue;
    for (const part of item.content ?? []) {
      const text = part.transcript?.trim() || part.text?.trim();
      if (text) parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export default function VoiceAssistant() {
  const {
    projects,
    teamMembers,
    ready,
    addProject,
    waitForProjectInsert,
    addComment,
    updateComment,
    deleteComment,
    regenerateSummary,
    deleteProject,
    getProjectUserReminder,
    updateProjectUserReminder,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    personalTodos,
    addPersonalTodo,
    updatePersonalTodo,
    deletePersonalTodo,
    addPersonalTodoComment,
    addContact,
    updateContact,
    deleteContact,
    updateProjectFile,
    deleteProjectFile,
    updateProject,
    updateFinancials,
    addPayment,
    generateIncomesFromSchedule,
    generateOpexSchedule,
    updatePayment,
    deletePayment,
    addExpense,
    generateMaterialsExpensesFromIncomes,
    updateExpense,
    deleteExpense,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    addGanttPhase,
    updateGanttPhase,
    deleteGanttPhase,
    addGanttActivity,
    updateGanttActivity,
    deleteGanttActivity,
    addGanttDeadline,
    updateGanttDeadline,
    deleteGanttDeadline,
    shiftProjectSchedule,
    financeSettings,
    updateFinanceSettings,
    metricsSettings,
    updateMetricsSettings,
    warehouse,
    receiveStock,
    transferStock,
    consumeStock,
    adjustStock,
    updateWarehouseLot,
    deleteWarehouseLot,
    upsertWarehouseItem,
    upsertWarehouseGroup,
    deleteWarehouseGroup,
    saveWarehouseBom,
    deleteWarehouseBom,
  } = useProjects();
  const prospecting = useProspecting();
  const {
    user,
    authEnabled,
    ready: authReady,
    can,
    canWrite,
    isViewer,
  } = useAuth();

  const enabled = process.env.NEXT_PUBLIC_AI_VOICE === "true";
  const hasAreaAccess = !authEnabled || Boolean(user && !isViewer);

  const [panelOpen, setPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [micMuted, setMicMuted] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toolResultsRef = useRef<Map<string, string>>(new Map());
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    projects,
    teamMembers,
    ready,
    addProject,
    waitForProjectInsert,
    addComment,
    updateComment,
    deleteComment,
    regenerateSummary,
    deleteProject,
    getProjectUserReminder,
    updateProjectUserReminder,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    personalTodos,
    addPersonalTodo,
    updatePersonalTodo,
    deletePersonalTodo,
    addPersonalTodoComment,
    addContact,
    updateContact,
    deleteContact,
    updateProjectFile,
    deleteProjectFile,
    updateProject,
    updateFinancials,
    addPayment,
    generateIncomesFromSchedule,
    generateOpexSchedule,
    updatePayment,
    deletePayment,
    addExpense,
    generateMaterialsExpensesFromIncomes,
    updateExpense,
    deleteExpense,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    addGanttPhase,
    updateGanttPhase,
    deleteGanttPhase,
    addGanttActivity,
    updateGanttActivity,
    deleteGanttActivity,
    addGanttDeadline,
    updateGanttDeadline,
    deleteGanttDeadline,
    shiftProjectSchedule,
    financeSettings,
    updateFinanceSettings,
    metricsSettings,
    updateMetricsSettings,
    warehouse,
    receiveStock,
    transferStock,
    consumeStock,
    adjustStock,
    updateWarehouseLot,
    deleteWarehouseLot,
    upsertWarehouseItem,
    upsertWarehouseGroup,
    deleteWarehouseGroup,
    saveWarehouseBom,
    deleteWarehouseBom,
    prospecting,
    user,
    authEnabled,
    canWrite,
  });
  stateRef.current = {
    projects,
    teamMembers,
    ready,
    addProject,
    waitForProjectInsert,
    addComment,
    updateComment,
    deleteComment,
    regenerateSummary,
    deleteProject,
    getProjectUserReminder,
    updateProjectUserReminder,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    personalTodos,
    addPersonalTodo,
    updatePersonalTodo,
    deletePersonalTodo,
    addPersonalTodoComment,
    addContact,
    updateContact,
    deleteContact,
    updateProjectFile,
    deleteProjectFile,
    updateProject,
    updateFinancials,
    addPayment,
    generateIncomesFromSchedule,
    generateOpexSchedule,
    updatePayment,
    deletePayment,
    addExpense,
    generateMaterialsExpensesFromIncomes,
    updateExpense,
    deleteExpense,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    addGanttPhase,
    updateGanttPhase,
    deleteGanttPhase,
    addGanttActivity,
    updateGanttActivity,
    deleteGanttActivity,
    addGanttDeadline,
    updateGanttDeadline,
    deleteGanttDeadline,
    shiftProjectSchedule,
    financeSettings,
    updateFinanceSettings,
    metricsSettings,
    updateMetricsSettings,
    warehouse,
    receiveStock,
    transferStock,
    consumeStock,
    adjustStock,
    updateWarehouseLot,
    deleteWarehouseLot,
    upsertWarehouseItem,
    upsertWarehouseGroup,
    deleteWarehouseGroup,
    saveWarehouseBom,
    deleteWarehouseBom,
    prospecting,
    user,
    authEnabled,
    canWrite,
  };

  const appendLog = useCallback((kind: LogKind, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLogs((prev) => [
      ...prev.slice(-49),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        text: trimmed,
      },
    ]);
  }, []);

  const allowedProjects = useCallback((): Project[] => {
    const s = stateRef.current;
    return s.projects.filter((project) => {
      if (isInternalHiddenProject(project)) return false;
      if (!s.authEnabled) return true;
      if (!s.user) return false;
      if (s.user.isAdmin) return true;
      const track = trackOfProject(project);
      if (track === "sales") {
        return (
          s.user.permissions.includes("sales") ||
          s.user.permissions.includes("technical_sales")
        );
      }
      return s.user.permissions.includes("eu_funding_rnd");
    });
  }, []);

  const executeTool = useCallback(
    async (name: string, rawArgs: string): Promise<string> => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
      } catch {
        return JSON.stringify({
          ok: false,
          error: "Invalid tool arguments.",
        });
      }

      const s = stateRef.current;
      if (!s.ready) {
        return JSON.stringify({
          ok: false,
          error: "CRM data is still loading. Ask the user to wait a moment.",
        });
      }

      const visibleProjects = allowedProjects();
      const has = (permission: PermissionType): boolean =>
        !s.authEnabled ||
        Boolean(
          s.user &&
            (s.user.isAdmin || s.user.permissions.includes(permission)),
        );
      const hasCoreProjectAccess = (project: Project): boolean => {
        if (!s.authEnabled || s.user?.isAdmin) return true;
        if (!s.user) return false;
        const track = trackOfProject(project);
        if (track === "sales") {
          return (
            s.user.permissions.includes("sales") ||
            s.user.permissions.includes("technical_sales")
          );
        }
        return s.user.permissions.includes("eu_funding_rnd");
      };
      const hasFinanceProjectAccess = (project: Project): boolean => {
        if (has("finance")) return true;
        const track = trackOfProject(project);
        return track !== "sales" && has("eu_funding_rnd");
      };
      const hasGanttReadAccess = (project: Project): boolean => {
        if (has("production")) return true;
        if (has("technical_sales")) return true;
        const track = trackOfProject(project);
        return track !== "sales" && has("eu_funding_rnd");
      };
      const hasGanttWriteAccess = (project: Project): boolean => {
        if (has("technical_sales")) return true;
        const track = trackOfProject(project);
        return track !== "sales" && has("eu_funding_rnd");
      };
      const searchableProjects = s.projects.filter((project) => {
        if (
          isInternalHiddenProject(project) &&
          !has("finance") &&
          !has("warehouse")
        ) {
          return false;
        }
        return (
          hasCoreProjectAccess(project) ||
          hasFinanceProjectAccess(project) ||
          has("warehouse") ||
          hasGanttReadAccess(project)
        );
      });
      const findProject = (id: unknown) =>
        typeof id === "string"
          ? visibleProjects.find((project) => project.id === id)
          : undefined;
      const findAnyProject = (id: unknown) =>
        typeof id === "string"
          ? searchableProjects.find((project) => project.id === id)
          : undefined;

      if (name === "search_projects") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({
            ok: false,
            error: "A project search query is required.",
          });
        }
        const matches = searchableProjects
          .map((project) => ({
            project,
            score: matchScore(query, project),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ project, score }) => ({
            id: project.id,
            name: project.name,
            client: project.client,
            location: [project.city, project.country].filter(Boolean).join(", "),
            stage: project.stage,
            stage_label: STAGE_LABELS[project.stage],
            track: trackOfProject(project),
            score,
          }));

        return JSON.stringify({
          ok: true,
          count: matches.length,
          projects: matches,
          instruction:
            matches.length === 1
              ? "One clear CRM match was found."
              : matches.length === 0
                ? "No CRM project matched. Ask the user for another project/client name."
                : "Multiple CRM matches were found. If more than one is plausible, ask the user which one they mean before writing.",
        });
      }

      if (name === "get_project") {
        const project = findAnyProject(args.project_id);
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }

        const coreAllowed = hasCoreProjectAccess(project);
        const financeAllowed = hasFinanceProjectAccess(project);
        const ganttAllowed = hasGanttReadAccess(project);
        const warehouseAllowed = has("warehouse");

        const projectData: Record<string, unknown> = {
          id: project.id,
          name: project.name,
          client: project.client,
          country: project.country,
          city: project.city,
          track: trackOfProject(project),
          permissions: {
            core: coreAllowed,
            finance: financeAllowed,
            gantt: ganttAllowed,
            warehouse: warehouseAllowed,
          },
        };

        if (coreAllowed) {
          const updates = [...(project.comments ?? [])]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
            .slice(0, 12)
            .map((comment) => ({
              id: comment.id,
              text: comment.text,
              author: comment.author,
              created_at: comment.createdAt,
              stage_change: comment.stageChange ?? null,
            }));

          const tasks = (project.todos ?? []).map((todo) => ({
            id: todo.id,
            text: todo.text,
            answer: todo.answer ?? null,
            done: todo.done,
            due_date: todo.dueDate ?? null,
            start_date: todo.startDate ?? null,
            end_date: todo.endDate ?? null,
            owner_user_id: todo.ownerUserId ?? null,
          }));

          Object.assign(projectData, {
            series: project.series,
            market: project.market,
            size_kw: project.sizeKw,
            stage: project.stage,
            stage_label: STAGE_LABELS[project.stage],
            summary: project.aiSummary || project.baseDescription || "",
            base_description: project.baseDescription,
            lead_user_id: project.leadUserId ?? null,
            last_client_contact_at: project.lastClientContactAt,
            email_reminder_days: project.emailReminderDays,
            email_reminder_enabled: project.emailReminderEnabled,
            pipeline_activity: {
              cold_lead_entered_at: project.coldLeadEnteredAt,
              hot_lead_entered_at: project.hotLeadEnteredAt ?? null,
              under_development_at: project.underDevelopmentAt ?? null,
              commissioned_at: project.commissionedAt ?? null,
              cancelled_at: project.cancelledAt ?? null,
              last_meaningful_activity_at: project.lastMeaningfulActivityAt,
              cancellation_reason: project.cancellationReason ?? null,
            },
            recent_updates: updates,
            tasks,
            contacts: (project.contacts ?? []).map((contact) => ({
              id: contact.id,
              name: contact.name ?? "",
              email: contact.email ?? "",
              phone: contact.phone ?? "",
              position: contact.position ?? "",
            })),
            files: (project.files ?? []).map((file) => ({
              id: file.id,
              name: file.name,
              kind: file.kind,
              note: file.note ?? null,
              mime_type: file.mimeType,
              size_bytes: file.sizeBytes,
              created_at: file.createdAt,
            })),
          });
        }

        if (financeAllowed) {
          projectData.financials = project.financials;
        }

        if (ganttAllowed) {
          projectData.schedule = project.schedule;
        }

        if (warehouseAllowed) {
          const projectBalances = s.warehouse.balances
            .filter(
              (balance) =>
                balance.location.slot === "project" &&
                balance.location.projectId === project.id,
            )
            .map((balance) => {
              const lot = s.warehouse.lots.find((x) => x.id === balance.lotId);
              const item = lot
                ? s.warehouse.items.find((x) => x.id === lot.itemId)
                : undefined;
              return {
                balance_id: balance.id,
                lot_id: balance.lotId,
                item_id: lot?.itemId ?? null,
                item_name: item?.name ?? null,
                qty: balance.qty,
                unit: item?.unit ?? null,
                site: balance.location.site,
              };
            });
          projectData.warehouse_stock = projectBalances;
        }

        return JSON.stringify({ ok: true, project: projectData });
      }

      if (name === "search_team_members") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({
            ok: false,
            error: "A team-member search query is required.",
          });
        }
        const matches = assignableTeamMembers(s.teamMembers)
          .map((member) => ({
            member,
            score: teamMemberScore(query, member),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ member, score }) => ({
            id: member.id,
            name: member.name,
            username: member.username ?? null,
            score,
          }));

        return JSON.stringify({
          ok: true,
          count: matches.length,
          team_members: matches,
          instruction:
            matches.length === 1
              ? "One clear assignable team member was found."
              : matches.length === 0
                ? "No assignable team member matched. Ask the user who should own the task."
                : "Multiple team members matched. Ask the user which person they mean before assigning.",
        });
      }

      if (name === "get_portfolio_update") {
        const ids = Array.isArray(args.project_ids)
          ? args.project_ids.filter((x): x is string => typeof x === "string")
          : [];
        const query = stringValue(args.query);
        const days =
          typeof args.days === "number" && Number.isFinite(args.days)
            ? Math.max(0, Math.floor(args.days))
            : null;
        const limit =
          typeof args.limit === "number" && Number.isFinite(args.limit)
            ? Math.max(1, Math.min(100, Math.floor(args.limit)))
            : 60;

        let selected = visibleProjects;
        if (ids.length > 0) {
          const wanted = new Set(ids);
          selected = selected.filter((project) => wanted.has(project.id));
        }
        if (query) {
          selected = selected.filter((project) => matchScore(query, project) > 0);
        }

        const cutoff =
          days == null ? null : Date.now() - days * 24 * 60 * 60 * 1000;
        const rows = selected
          .map((project) => {
            const updates = [...(project.comments ?? [])].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            const recentUpdates =
              cutoff == null
                ? updates.slice(0, 4)
                : updates
                    .filter(
                      (x) => new Date(x.createdAt).getTime() >= cutoff,
                    )
                    .slice(0, 6);
            const openTasks = (project.todos ?? [])
              .filter((todo) => !todo.done)
              .sort((a, b) =>
                (a.dueDate ?? "9999-12-31").localeCompare(
                  b.dueDate ?? "9999-12-31",
                ),
              )
              .slice(0, 6)
              .map((todo) => ({
                id: todo.id,
                text: todo.text,
                due_date: todo.dueDate ?? null,
                owner_user_id: todo.ownerUserId ?? null,
              }));
            const latestActivityAt =
              recentUpdates[0]?.createdAt ??
              project.lastMeaningfulActivityAt ??
              project.createdAt;
            return {
              id: project.id,
              name: project.name,
              client: project.client,
              stage: project.stage,
              stage_label: STAGE_LABELS[project.stage],
              track: trackOfProject(project),
              summary: project.aiSummary || project.baseDescription || "",
              latest_activity_at: latestActivityAt,
              recent_updates: recentUpdates.map((update) => ({
                text: update.text,
                author: update.author,
                created_at: update.createdAt,
                stage_change: update.stageChange ?? null,
              })),
              open_tasks: openTasks,
            };
          })
          .sort((a, b) =>
            String(b.latest_activity_at).localeCompare(
              String(a.latest_activity_at),
            ),
          )
          .slice(0, limit);

        return JSON.stringify({
          ok: true,
          count: rows.length,
          requested_all_projects: ids.length === 0 && !query,
          projects: rows,
          instruction:
            "Summarize these facts in the format the user asked for. For an update request, prioritize what changed recently, current stage, blockers/open actions, and next steps. Do not invent missing events.",
        });
      }

      if (name === "search_prospects") {
        if (!has("sales")) {
          return JSON.stringify({
            ok: false,
            error: "Prospecting requires Sales permission.",
          });
        }
        if (!s.prospecting.ready) {
          return JSON.stringify({
            ok: false,
            error: "Prospecting data is still loading.",
          });
        }
        const query = stringValue(args.query);
        if (!query) {
          return JSON.stringify({
            ok: false,
            error: "A prospect search query is required.",
          });
        }
        const q = normalizeSearch(query);
        const matches = s.prospecting.companies
          .map((company) => {
            const contacts = s.prospecting.contacts.filter(
              (contact) => contact.companyId === company.id,
            );
            const haystack = normalizeSearch(
              [
                company.name,
                company.country,
                company.city,
                company.siteName,
                company.website,
                company.industry,
                company.notes,
                ...contacts.flatMap((contact) => [
                  contact.name,
                  contact.email,
                  contact.phone,
                  contact.title,
                ]),
              ].join(" "),
            );
            let score = 0;
            const companyName = normalizeSearch(company.name);
            if (companyName === q) score += 120;
            if (companyName.startsWith(q)) score += 70;
            if (companyName.includes(q)) score += 50;
            if (haystack.includes(q)) score += 35;
            for (const token of q.split(/\s+/).filter(Boolean)) {
              if (haystack.includes(token)) score += 8;
            }
            return { company, contacts, score };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(({ company, contacts, score }) => ({
            id: company.id,
            name: company.name,
            location: [company.city, company.country].filter(Boolean).join(", "),
            industry: company.industry,
            status: company.status,
            priority: company.priority,
            next_action: company.nextAction,
            next_action_at: company.nextActionAt,
            contacts: contacts.slice(0, 5).map((contact) => ({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              title: contact.title,
            })),
            score,
          }));
        return JSON.stringify({ ok: true, count: matches.length, prospects: matches });
      }

      if (name === "get_prospect") {
        if (!has("sales")) {
          return JSON.stringify({
            ok: false,
            error: "Prospecting requires Sales permission.",
          });
        }
        const companyId = stringValue(args.company_id);
        const company = companyId
          ? s.prospecting.companies.find((x) => x.id === companyId)
          : undefined;
        if (!company) {
          return JSON.stringify({ ok: false, error: "Prospect company not found." });
        }
        const contacts = s.prospecting.contacts.filter(
          (contact) => contact.companyId === company.id,
        );
        const activities = s.prospecting.activities
          .filter((activity) => activity.companyId === company.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 25);
        return JSON.stringify({
          ok: true,
          company,
          contacts,
          recent_activities: activities,
        });
      }

      if (name === "manage_personal_todo" && args.action === "list") {
        const mine =
          s.authEnabled && s.user
            ? s.personalTodos.filter(
                (todo) => todo.ownerUserId === s.user?.userId,
              )
            : s.personalTodos;
        return JSON.stringify({ ok: true, todos: mine });
      }

      if (name === "manage_prospecting_strategy" && args.action === "list") {
        if (!has("sales")) {
          return JSON.stringify({
            ok: false,
            error: "Prospecting strategies require Sales permission.",
          });
        }
        return JSON.stringify({
          ok: true,
          strategies: s.prospecting.strategies,
          targets: s.prospecting.targets,
          kpis: s.prospecting.kpis,
        });
      }

      if (name === "manage_project_finance" && args.action === "get") {
        const project = findAnyProject(args.project_id);
        if (!project || !hasFinanceProjectAccess(project)) {
          return JSON.stringify({
            ok: false,
            error: "Project finance is not available to this user.",
          });
        }
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          financials: project.financials,
        });
      }

      if (name === "manage_gantt" && args.action === "get") {
        const project = findAnyProject(args.project_id);
        if (!project || !hasGanttReadAccess(project)) {
          return JSON.stringify({
            ok: false,
            error: "Project schedule is not available to this user.",
          });
        }
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          schedule: project.schedule,
          can_edit: hasGanttWriteAccess(project) && (!s.authEnabled || s.canWrite),
        });
      }

      if (name === "manage_warehouse") {
        const action = stringValue(args.action);
        if (action === "summary" || action === "search_items") {
          if (!has("warehouse")) {
            return JSON.stringify({
              ok: false,
              error: "Warehouse access requires Warehouse permission.",
            });
          }
          if (action === "summary") {
            const onHand = s.warehouse.balances.reduce(
              (sum, balance) => sum + Math.max(0, balance.qty),
              0,
            );
            return JSON.stringify({
              ok: true,
              item_count: s.warehouse.items.length,
              lot_count: s.warehouse.lots.length,
              balance_count: s.warehouse.balances.length,
              total_quantity_units: onHand,
              groups: s.warehouse.groups,
              boms: s.warehouse.boms,
            });
          }
          const q = normalizeSearch(stringValue(args.query) ?? "");
          const items = s.warehouse.items
            .filter((item) => {
              if (!q) return true;
              return normalizeSearch(
                [item.name, item.sku ?? "", item.preferredSupplier ?? ""].join(" "),
              ).includes(q);
            })
            .slice(0, 30)
            .map((item) => ({
              ...item,
              on_hand: s.warehouse.balances
                .filter((balance) => {
                  const lot = s.warehouse.lots.find(
                    (candidate) => candidate.id === balance.lotId,
                  );
                  return lot?.itemId === item.id;
                })
                .reduce((sum, balance) => sum + balance.qty, 0),
            }));
          return JSON.stringify({ ok: true, items });
        }
      }

      if (name === "manage_company_settings") {
        const action = stringValue(args.action);
        if (action === "get_finance") {
          if (!has("finance")) {
            return JSON.stringify({
              ok: false,
              error: "Company finance settings require Finance permission.",
            });
          }
          return JSON.stringify({ ok: true, finance_settings: s.financeSettings });
        }
        if (action === "get_metrics") {
          if (!has("sales")) {
            return JSON.stringify({
              ok: false,
              error: "Pipeline metrics settings require Sales permission.",
            });
          }
          return JSON.stringify({ ok: true, metrics_settings: s.metricsSettings });
        }
      }

      const canMutate = !s.authEnabled || s.canWrite;
      if (!canMutate) {
        return JSON.stringify({
          ok: false,
          error: "This account is read-only and cannot change CRM data.",
        });
      }

      if (name === "manage_project_record") {
        const project = findProject(args.project_id);
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or core project access is not available to this user.",
          });
        }
        const action = stringValue(args.action);
        const recordId = stringValue(args.record_id);

        if (action === "update_comment" || action === "delete_comment") {
          const comment = recordId
            ? project.comments.find((candidate) => candidate.id === recordId)
            : undefined;
          if (!comment) {
            return JSON.stringify({
              ok: false,
              error: "A valid comment record_id is required.",
            });
          }
          if (action === "delete_comment") {
            s.deleteComment(project.id, comment.id);
            appendLog("action", `Deleted an update from ${project.name}.`);
            return JSON.stringify({
              ok: true,
              deleted: "project_comment",
              record_id: comment.id,
            });
          }
          const text = stringValue(args.text);
          if (!text) {
            return JSON.stringify({
              ok: false,
              error: "Updated comment text is required.",
            });
          }
          s.updateComment(project.id, comment.id, text);
          appendLog("action", `Updated an entry on ${project.name}.`);
          return JSON.stringify({
            ok: true,
            updated: "project_comment",
            record_id: comment.id,
          });
        }

        if (action === "regenerate_summary") {
          s.regenerateSummary(project.id);
          return JSON.stringify({
            ok: true,
            project_id: project.id,
            requested: "summary_regeneration",
          });
        }

        if (
          action === "get_followup_reminder" ||
          action === "update_followup_reminder"
        ) {
          if (trackOfProject(project) !== "sales") {
            return JSON.stringify({
              ok: false,
              error: "Client follow-up reminders are only used on Sales projects.",
            });
          }
          if (action === "get_followup_reminder") {
            return JSON.stringify({
              ok: true,
              reminder: s.getProjectUserReminder(
                project.id,
                s.user?.userId ?? null,
              ),
            });
          }

          const patch: Parameters<typeof s.updateProjectUserReminder>[1] = {};
          if (typeof args.email_reminder_days === "number") {
            patch.emailReminderDays = Math.max(
              1,
              Math.round(args.email_reminder_days),
            );
          }
          if (typeof args.email_reminder_enabled === "boolean") {
            patch.emailReminderEnabled = args.email_reminder_enabled;
          }
          if (typeof args.last_client_contact_at === "string") {
            if (!isValidDateOnly(args.last_client_contact_at)) {
              return JSON.stringify({
                ok: false,
                error: "last_client_contact_at must be a valid YYYY-MM-DD date.",
              });
            }
            patch.lastClientContactAt = args.last_client_contact_at;
          }
          if (Object.keys(patch).length === 0) {
            return JSON.stringify({
              ok: false,
              error: "No follow-up reminder fields were provided.",
            });
          }
          s.updateProjectUserReminder(project.id, patch);
          return JSON.stringify({
            ok: true,
            updated: "project_followup_reminder",
            fields: Object.keys(patch),
          });
        }

        if (action === "update_file_metadata" || action === "delete_file") {
          const file = recordId
            ? project.files.find((candidate) => candidate.id === recordId)
            : undefined;
          if (!file) {
            return JSON.stringify({
              ok: false,
              error: "A valid project file record_id is required.",
            });
          }
          if (action === "delete_file") {
            await s.deleteProjectFile(project.id, file.id);
            appendLog("action", `Deleted ${file.name} from ${project.name}.`);
            return JSON.stringify({
              ok: true,
              deleted: "project_file",
              record_id: file.id,
            });
          }
          const patch: Parameters<typeof s.updateProjectFile>[2] = {};
          if (typeof args.file_kind === "string") {
            patch.kind = args.file_kind as typeof file.kind;
          }
          if (args.note === null) {
            patch.note = null;
          } else if (typeof args.note === "string") {
            patch.note = args.note.trim() || null;
          }
          if (Object.keys(patch).length === 0) {
            return JSON.stringify({
              ok: false,
              error: "No file metadata fields were provided.",
            });
          }
          s.updateProjectFile(project.id, file.id, patch);
          return JSON.stringify({
            ok: true,
            updated: "project_file_metadata",
            record_id: file.id,
          });
        }

        if (action === "delete_project") {
          s.deleteProject(project.id);
          appendLog("action", `Deleted project ${project.name}.`);
          return JSON.stringify({
            ok: true,
            deleted: "project",
            project_id: project.id,
            project_name: project.name,
          });
        }

        return JSON.stringify({
          ok: false,
          error: "Unsupported project-record action.",
        });
      }

      if (name === "create_project") {
        const track =
          args.track === "eu" || args.track === "rnd" ? args.track : "sales";
        const trackAllowed =
          track === "sales"
            ? has("sales") || has("technical_sales")
            : has("eu_funding_rnd");
        if (!trackAllowed) {
          return JSON.stringify({
            ok: false,
            error: "You do not have permission to create projects on that track.",
          });
        }

        const projectName = stringValue(args.name);
        const client = stringValue(args.client);
        const country = stringValue(args.country);
        if (!projectName || !client || !country) {
          return JSON.stringify({
            ok: false,
            error: "Project name, client/organisation, and country are required.",
          });
        }

        const leadUserId = stringValue(args.lead_user_id);
        if (
          leadUserId &&
          !assignableTeamMembers(s.teamMembers).some((member) => member.id === leadUserId)
        ) {
          return JSON.stringify({
            ok: false,
            error: "The requested project lead is not assignable. Search the team roster first.",
          });
        }

        const defaultStage: Stage =
          track === "eu"
            ? "eu-application-prep"
            : track === "rnd"
              ? "rnd-execution"
              : "cold-lead";
        const requestedStage =
          typeof args.stage === "string" ? (args.stage as Stage) : defaultStage;
        if (!stagesForTrack(track).includes(requestedStage)) {
          return JSON.stringify({
            ok: false,
            error: "That stage is not valid for the requested project track.",
          });
        }

        const id = s.addProject({
          name: projectName,
          client,
          country,
          city: stringValue(args.city) ?? "",
          series: (stringValue(args.series) ?? "Z Series") as Project["series"],
          market: (stringValue(args.market) ?? "Clean H2") as Project["market"],
          sizeKw: numberValue(args.size_kw) ?? 0,
          stage: requestedStage,
          baseDescription: stringValue(args.description) ?? "",
          ...(leadUserId ? { leadUserId } : {}),
          track,
        });
        appendLog("action", `Created project ${projectName}.`);
        return JSON.stringify({
          ok: true,
          project_id: id,
          project_name: projectName,
          track,
          stage: requestedStage,
        });
      }

      if (name === "update_project_fields") {
        const project = findProject(args.project_id);
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or core project access is not available to this user.",
          });
        }
        const patch: Parameters<typeof s.updateProject>[1] = {};
        if (typeof args.name === "string") patch.name = args.name.trim();
        if (typeof args.client === "string") patch.client = args.client.trim();
        if (typeof args.country === "string") patch.country = args.country.trim();
        if (typeof args.city === "string") patch.city = args.city.trim();
        if (typeof args.series === "string") {
          patch.series = args.series.trim() as Project["series"];
        }
        if (typeof args.market === "string") {
          patch.market = args.market.trim() as Project["market"];
        }
        if (typeof args.size_kw === "number" && Number.isFinite(args.size_kw)) {
          patch.sizeKw = Math.max(0, args.size_kw);
        }
        if (typeof args.stage === "string") {
          const stage = args.stage as Stage;
          if (!stagesForTrack(trackOfProject(project)).includes(stage)) {
            return JSON.stringify({
              ok: false,
              error: "That stage is not valid for this project's track.",
            });
          }
          patch.stage = stage;
        }
        if (typeof args.description === "string") {
          patch.baseDescription = args.description.trim();
        }
        if (args.lead_user_id === null) {
          patch.leadUserId = undefined;
        } else if (typeof args.lead_user_id === "string") {
          const lead = args.lead_user_id.trim();
          if (
            lead &&
            !assignableTeamMembers(s.teamMembers).some((member) => member.id === lead)
          ) {
            return JSON.stringify({
              ok: false,
              error: "The requested project lead is not assignable.",
            });
          }
          patch.leadUserId = lead || undefined;
        }
        if (typeof args.last_client_contact_at === "string") {
          if (!isValidDateOnly(args.last_client_contact_at)) {
            return JSON.stringify({ ok: false, error: "last_client_contact_at must be YYYY-MM-DD." });
          }
          patch.lastClientContactAt = args.last_client_contact_at;
        }
        if (typeof args.email_reminder_days === "number") {
          patch.emailReminderDays = Math.max(1, Math.round(args.email_reminder_days));
        }
        if (typeof args.email_reminder_enabled === "boolean") {
          patch.emailReminderEnabled = args.email_reminder_enabled;
        }

        const dateMappings = [
          ["cold_lead_entered_at", "coldLeadEnteredAt"],
          ["hot_lead_entered_at", "hotLeadEnteredAt"],
          ["under_development_at", "underDevelopmentAt"],
          ["commissioned_at", "commissionedAt"],
          ["cancelled_at", "cancelledAt"],
          ["last_meaningful_activity_at", "lastMeaningfulActivityAt"],
        ] as const;
        for (const [argKey, patchKey] of dateMappings) {
          const raw = args[argKey];
          if (raw === null) {
            if (patchKey !== "coldLeadEnteredAt" && patchKey !== "lastMeaningfulActivityAt") {
              (patch as Record<string, unknown>)[patchKey] = undefined;
            }
          } else if (typeof raw === "string") {
            if (!isValidDateOnly(raw)) {
              return JSON.stringify({
                ok: false,
                error: `${argKey} must be a real YYYY-MM-DD date.`,
              });
            }
            (patch as Record<string, unknown>)[patchKey] = raw;
          }
        }
        if (args.cancellation_reason === null) {
          patch.cancellationReason = undefined;
        } else if (typeof args.cancellation_reason === "string") {
          patch.cancellationReason = args.cancellation_reason.trim() || undefined;
        }

        if (Object.keys(patch).length === 0) {
          return JSON.stringify({ ok: false, error: "No project fields were provided to update." });
        }
        s.updateProject(project.id, patch);
        appendLog("action", `Updated ${project.name}.`);
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          updated_fields: Object.keys(patch),
        });
      }

      if (name === "manage_project_task") {
        const project = findProject(args.project_id);
        if (!project) {
          return JSON.stringify({ ok: false, error: "Project not found or unavailable." });
        }
        const action = stringValue(args.action);
        if (action === "create") {
          const text = stringValue(args.text);
          if (!text) {
            return JSON.stringify({ ok: false, error: "Task text is required." });
          }
          const due = validOptionalDate(args.due_date);
          const start = validOptionalDate(args.start_date);
          const endDate = validOptionalDate(args.end_date);
          if (
            (typeof args.due_date === "string" && args.due_date.trim() && due === undefined) ||
            (typeof args.start_date === "string" && args.start_date.trim() && start === undefined) ||
            (typeof args.end_date === "string" && args.end_date.trim() && endDate === undefined)
          ) {
            return JSON.stringify({ ok: false, error: "Task dates must use valid YYYY-MM-DD dates." });
          }
          const owner = nullableStringValue(args.owner_user_id) ?? undefined;
          if (
            owner &&
            !assignableTeamMembers(s.teamMembers).some((member) => member.id === owner)
          ) {
            return JSON.stringify({ ok: false, error: "Task assignee is not assignable." });
          }
          s.addTodo(
            project.id,
            "our-action",
            text,
            due ?? undefined,
            owner,
            start ?? undefined,
            endDate ?? undefined,
          );
          appendLog("action", `Created task on ${project.name}.`);
          return JSON.stringify({ ok: true, saved: "task", project_id: project.id });
        }

        const taskId = stringValue(args.task_id);
        const task = taskId ? project.todos.find((todo) => todo.id === taskId) : undefined;
        if (!task) {
          return JSON.stringify({ ok: false, error: "A valid task_id is required for this action." });
        }
        if (action === "delete") {
          s.deleteTodo(project.id, task.id);
          appendLog("action", `Deleted task from ${project.name}.`);
          return JSON.stringify({ ok: true, deleted: "task", task_id: task.id });
        }
        if (action === "complete" || action === "reopen") {
          const targetDone = action === "complete";
          if (task.done !== targetDone) s.toggleTodo(project.id, task.id);
          return JSON.stringify({ ok: true, task_id: task.id, done: targetDone });
        }
        if (action === "update") {
          const patch: Parameters<typeof s.updateTodo>[2] = {};
          if (typeof args.text === "string") patch.text = args.text.trim();
          if (args.answer === null || typeof args.answer === "string") {
            patch.answer = args.answer === null ? null : args.answer.trim();
          }
          for (const [argKey, patchKey] of [
            ["due_date", "dueDate"],
            ["start_date", "startDate"],
            ["end_date", "endDate"],
          ] as const) {
            const raw = args[argKey];
            if (raw === null) {
              (patch as Record<string, unknown>)[patchKey] = null;
            } else if (typeof raw === "string") {
              if (!isValidDateOnly(raw)) {
                return JSON.stringify({ ok: false, error: `${argKey} must be YYYY-MM-DD.` });
              }
              (patch as Record<string, unknown>)[patchKey] = raw;
            }
          }
          if (args.owner_user_id === null) {
            patch.ownerUserId = null;
          } else if (typeof args.owner_user_id === "string") {
            const owner = args.owner_user_id.trim();
            if (
              owner &&
              !assignableTeamMembers(s.teamMembers).some((member) => member.id === owner)
            ) {
              return JSON.stringify({ ok: false, error: "Task assignee is not assignable." });
            }
            patch.ownerUserId = owner || null;
          }
          s.updateTodo(project.id, task.id, patch);
          return JSON.stringify({ ok: true, task_id: task.id, updated_fields: Object.keys(patch) });
        }
        return JSON.stringify({ ok: false, error: "Unsupported project task action." });
      }

      if (name === "manage_project_contact") {
        const project = findProject(args.project_id);
        if (!project) {
          return JSON.stringify({ ok: false, error: "Project not found or unavailable." });
        }
        const action = stringValue(args.action);
        const contactInput = {
          ...(typeof args.name === "string" ? { name: args.name.trim() } : {}),
          ...(typeof args.email === "string" ? { email: args.email.trim() } : {}),
          ...(typeof args.phone === "string" ? { phone: args.phone.trim() } : {}),
          ...(typeof args.position === "string" ? { position: args.position.trim() } : {}),
        };
        if (action === "add") {
          if (Object.keys(contactInput).length === 0) {
            return JSON.stringify({ ok: false, error: "Provide at least one contact detail." });
          }
          s.addContact(project.id, contactInput);
          appendLog("action", `Added contact to ${project.name}.`);
          return JSON.stringify({ ok: true, saved: "project_contact" });
        }
        const contactId = stringValue(args.contact_id);
        const contact = contactId
          ? project.contacts.find((candidate) => candidate.id === contactId)
          : undefined;
        if (!contact) {
          return JSON.stringify({ ok: false, error: "A valid contact_id is required." });
        }
        if (action === "update") {
          s.updateContact(project.id, contact.id, contactInput);
          return JSON.stringify({ ok: true, contact_id: contact.id });
        }
        if (action === "delete") {
          s.deleteContact(project.id, contact.id);
          return JSON.stringify({ ok: true, deleted: "project_contact", contact_id: contact.id });
        }
        return JSON.stringify({ ok: false, error: "Unsupported project contact action." });
      }

      if (name === "manage_personal_todo") {
        const action = stringValue(args.action);
        if (action === "create") {
          const title = stringValue(args.title);
          if (!title) {
            return JSON.stringify({ ok: false, error: "To-Do title is required." });
          }
          const input: Parameters<typeof s.addPersonalTodo>[0] = {
            title,
            status: (stringValue(args.status) ?? "todo") as PersonalTodoStatus,
            ...(stringValue(args.description) ? { description: stringValue(args.description) } : {}),
            ...(validOptionalDate(args.due_date) ? { dueDate: validOptionalDate(args.due_date) as string } : {}),
            ...(validOptionalDate(args.start_date) ? { startDate: validOptionalDate(args.start_date) as string } : {}),
            ...(validOptionalDate(args.end_date) ? { endDate: validOptionalDate(args.end_date) as string } : {}),
            ...(s.user?.userId ? { ownerUserId: s.user.userId } : {}),
          };
          const id = s.addPersonalTodo(input);
          appendLog("action", `Created personal To-Do: ${title}.`);
          return JSON.stringify({ ok: true, todo_id: id, title });
        }
        const todoId = stringValue(args.todo_id);
        const todo = todoId ? s.personalTodos.find((x) => x.id === todoId) : undefined;
        if (!todo) {
          return JSON.stringify({ ok: false, error: "A valid personal todo_id is required." });
        }
        if (s.authEnabled && s.user && todo.ownerUserId !== s.user.userId) {
          return JSON.stringify({ ok: false, error: "Personal To-Dos are private to their owner." });
        }
        if (action === "delete") {
          s.deletePersonalTodo(todo.id);
          return JSON.stringify({ ok: true, deleted: "personal_todo", todo_id: todo.id });
        }
        if (action === "add_comment") {
          const comment = stringValue(args.comment);
          if (!comment) return JSON.stringify({ ok: false, error: "Comment text is required." });
          s.addPersonalTodoComment(todo.id, comment);
          return JSON.stringify({ ok: true, todo_id: todo.id, saved: "comment" });
        }
        if (action === "update") {
          const patch: Parameters<typeof s.updatePersonalTodo>[1] = {};
          if (typeof args.title === "string") patch.title = args.title.trim();
          if (args.description === null || typeof args.description === "string") {
            patch.description = args.description === null ? null : args.description.trim();
          }
          if (typeof args.status === "string") {
            patch.status = args.status as PersonalTodoStatus;
          }
          for (const [argKey, patchKey] of [
            ["due_date", "dueDate"],
            ["start_date", "startDate"],
            ["end_date", "endDate"],
          ] as const) {
            const raw = args[argKey];
            if (raw === null) {
              (patch as Record<string, unknown>)[patchKey] = null;
            } else if (typeof raw === "string") {
              if (!isValidDateOnly(raw)) {
                return JSON.stringify({ ok: false, error: `${argKey} must be YYYY-MM-DD.` });
              }
              (patch as Record<string, unknown>)[patchKey] = raw;
            }
          }
          s.updatePersonalTodo(todo.id, patch);
          return JSON.stringify({ ok: true, todo_id: todo.id, updated_fields: Object.keys(patch) });
        }
        return JSON.stringify({ ok: false, error: "Unsupported personal To-Do action." });
      }

      if (name === "manage_prospect") {
        if (!has("sales")) {
          return JSON.stringify({ ok: false, error: "Prospecting requires Sales permission." });
        }
        const p = s.prospecting;
        const action = stringValue(args.action);
        const companyId = stringValue(args.company_id);
        const contactId = stringValue(args.contact_id);
        const company = companyId ? p.companies.find((x) => x.id === companyId) : undefined;
        const contact = contactId ? p.contacts.find((x) => x.id === contactId) : undefined;

        if (action === "create_company") {
          const companyName = stringValue(args.name);
          const market = stringValue(args.market);
          if (!companyName || !market) {
            return JSON.stringify({
              ok: false,
              error: "Company name and market are required to create a prospect.",
            });
          }
          const requestedOwner = stringValue(args.owner_user_id) ?? s.user?.userId;
          if (!requestedOwner) {
            return JSON.stringify({ ok: false, error: "A prospect owner is required." });
          }
          const ownerAssignable = assignableTeamMembers(s.teamMembers).some(
            (member) => member.id === requestedOwner,
          );
          if (!ownerAssignable) {
            return JSON.stringify({
              ok: false,
              error: "The prospect owner is not assignable. Search the team roster first.",
            });
          }
          const contactName = stringValue(args.contact_name);
          const hasContactDetails =
            Boolean(contactName) ||
            Boolean(stringValue(args.email)) ||
            Boolean(stringValue(args.phone)) ||
            Boolean(stringValue(args.title)) ||
            Boolean(stringValue(args.linkedin_url));
          const result = p.addCompany({
            name: companyName,
            country: stringValue(args.country),
            city: stringValue(args.city),
            siteName: stringValue(args.site_name),
            website: stringValue(args.website),
            industry: stringValue(args.industry),
            market: market as Parameters<typeof p.addCompany>[0]["market"],
            system: stringValue(args.system) as Parameters<typeof p.addCompany>[0]["system"],
            source: stringValue(args.source) as Parameters<typeof p.addCompany>[0]["source"],
            priority: (stringValue(args.priority) ?? "medium") as ProspectPriority,
            ownerId: requestedOwner,
            notes: stringValue(args.notes),
            sizeKw: numberValue(args.size_kw),
            ...(hasContactDetails
              ? {
                  contact: {
                    name: contactName,
                    title: stringValue(args.title),
                    email: stringValue(args.email),
                    phone: stringValue(args.phone),
                    linkedinUrl: stringValue(args.linkedin_url),
                    isPrimary: true,
                  },
                }
              : {}),
          });
          appendLog("action", `Created prospect ${companyName}.`);
          return JSON.stringify({ ok: true, ...result, company_name: companyName });
        }

        if (!company && action !== "update_contact" && action !== "delete_contact") {
          return JSON.stringify({ ok: false, error: "A valid company_id is required." });
        }

        if (action === "update_company" && company) {
          const patch: Partial<typeof company> = {};
          const simpleMappings = [
            ["name", "name"],
            ["country", "country"],
            ["city", "city"],
            ["site_name", "siteName"],
            ["website", "website"],
            ["industry", "industry"],
            ["market", "market"],
            ["system", "system"],
            ["source", "source"],
            ["notes", "notes"],
            ["existing_relationship", "existingRelationship"],
            ["next_action", "nextAction"],
          ] as const;
          for (const [argKey, key] of simpleMappings) {
            if (typeof args[argKey] === "string") {
              (patch as Record<string, unknown>)[key] = String(args[argKey]).trim();
            }
          }
          if (typeof args.priority === "string") patch.priority = args.priority as ProspectPriority;
          if (typeof args.status === "string") patch.status = args.status as ProspectStatus;
          if (typeof args.owner_user_id === "string") patch.ownerId = args.owner_user_id.trim();
          if (typeof args.size_kw === "number") patch.sizeKw = Math.max(0, args.size_kw);
          if (args.potential_value === null || typeof args.potential_value === "number") {
            patch.potentialValue = args.potential_value as number | null;
          }
          if (args.next_action_at === null) patch.nextActionAt = null;
          else if (typeof args.next_action_at === "string") {
            if (!isValidDateOnly(args.next_action_at)) {
              return JSON.stringify({ ok: false, error: "next_action_at must be YYYY-MM-DD." });
            }
            patch.nextActionAt = args.next_action_at;
          }
          if (args.qualification && typeof args.qualification === "object") {
            patch.qualification = {
              ...company.qualification,
              ...(args.qualification as ProspectQualification),
            };
          }
          p.updateCompany(company.id, patch);
          return JSON.stringify({ ok: true, company_id: company.id, updated_fields: Object.keys(patch) });
        }

        if (action === "delete_company" && company) {
          p.deleteCompany(company.id);
          return JSON.stringify({ ok: true, deleted: "prospect_company", company_id: company.id });
        }

        if (action === "add_contact" && company) {
          const requestedOwner = stringValue(args.owner_user_id) ?? company.ownerId ?? s.user?.userId;
          if (!requestedOwner) {
            return JSON.stringify({ ok: false, error: "A contact owner is required." });
          }
          const result = p.addContact(company.id, {
            ownerId: requestedOwner,
            name: stringValue(args.name) ?? "",
            title: stringValue(args.title),
            department: stringValue(args.department),
            email: stringValue(args.email),
            phone: stringValue(args.phone),
            linkedinUrl: stringValue(args.linkedin_url),
            preferredMethod: stringValue(args.preferred_method) as Parameters<typeof p.addContact>[1]["preferredMethod"],
            priority: (stringValue(args.priority) ?? company.priority) as ProspectPriority,
            source: stringValue(args.source) as Parameters<typeof p.addContact>[1]["source"],
            isPrimary: booleanValue(args.is_primary),
            notes: stringValue(args.notes),
          });
          return JSON.stringify({ ok: true, ...result });
        }

        if ((action === "update_contact" || action === "delete_contact") && !contact) {
          return JSON.stringify({ ok: false, error: "A valid contact_id is required." });
        }
        if (action === "update_contact" && contact) {
          const patch: Partial<typeof contact> = {};
          const contactMappings = [
            ["name", "name"],
            ["title", "title"],
            ["department", "department"],
            ["email", "email"],
            ["phone", "phone"],
            ["linkedin_url", "linkedinUrl"],
            ["preferred_method", "preferredMethod"],
            ["notes", "notes"],
            ["status", "status"],
            ["source", "source"],
          ] as const;
          for (const [argKey, key] of contactMappings) {
            if (typeof args[argKey] === "string") {
              (patch as Record<string, unknown>)[key] = String(args[argKey]).trim();
            }
          }
          if (typeof args.priority === "string") patch.priority = args.priority as ProspectPriority;
          if (typeof args.owner_user_id === "string") patch.ownerId = args.owner_user_id.trim();
          if (typeof args.is_primary === "boolean") patch.isPrimary = args.is_primary;
          p.updateContact(contact.id, patch);
          return JSON.stringify({ ok: true, contact_id: contact.id, updated_fields: Object.keys(patch) });
        }
        if (action === "delete_contact" && contact) {
          p.deleteContact(contact.id);
          return JSON.stringify({ ok: true, deleted: "prospect_contact", contact_id: contact.id });
        }

        if (action === "schedule_follow_up" && contact) {
          const followUp = stringValue(args.follow_up_at);
          if (!followUp || !isValidDateOnly(followUp)) {
            return JSON.stringify({ ok: false, error: "A valid follow_up_at date is required." });
          }
          p.scheduleFollowUp(contact.id, followUp, stringValue(args.next_action) ?? stringValue(args.summary));
          return JSON.stringify({ ok: true, contact_id: contact.id, follow_up_at: followUp });
        }

        if (action === "mark_engaged" && contact) {
          p.markEngaged(contact.id);
          return JSON.stringify({ ok: true, contact_id: contact.id, status: "engaged" });
        }

        if (action === "mark_qualified" && company) {
          const qualification =
            args.qualification && typeof args.qualification === "object"
              ? (args.qualification as ProspectQualification)
              : undefined;
          p.markQualified(company.id, qualification);
          return JSON.stringify({ ok: true, company_id: company.id, status: "qualified" });
        }

        if (action === "log_outreach" && company) {
          if (!contact || contact.companyId !== company.id) {
            return JSON.stringify({
              ok: false,
              error: "A valid contact_id belonging to the prospect company is required.",
            });
          }
          const channel = stringValue(args.channel) as OutreachChannel | undefined;
          const result = stringValue(args.result) as OutreachResult | undefined;
          const summary = stringValue(args.summary);
          if (!channel || !result || !summary || !s.user?.userId) {
            return JSON.stringify({
              ok: false,
              error: "channel, result, summary, and a signed-in user are required.",
            });
          }
          const nextActionAt =
            args.follow_up_at === null
              ? null
              : validOptionalDate(args.follow_up_at) ?? undefined;
          const activityId = p.logOutreach({
            companyId: company.id,
            contactId: contact.id,
            userId: s.user.userId,
            channel,
            result,
            summary,
            nextAction: stringValue(args.next_action),
            nextActionAt,
          });
          return JSON.stringify({ ok: true, activity_id: activityId });
        }

        if (action === "promote_to_project" && company) {
          const projectName =
            stringValue(args.project_name) ||
            (company.siteName
              ? `${company.name} — ${company.siteName}`
              : `${company.name} opportunity`);
          const projectStage =
            typeof args.project_stage === "string"
              ? (args.project_stage as Stage)
              : "cold-lead";
          if (!stagesForTrack("sales").includes(projectStage)) {
            return JSON.stringify({ ok: false, error: "Invalid Sales project stage." });
          }
          const id = s.addProject({
            name: projectName,
            client: company.name,
            country: company.country || "—",
            city: company.city,
            series: company.system,
            market: company.market,
            sizeKw: company.sizeKw > 0 ? company.sizeKw : 0,
            stage: projectStage,
            baseDescription:
              stringValue(args.project_description) ||
              [
                company.strategyWhy && `Why: ${company.strategyWhy}`,
                company.qualification.painPoint && `Pain: ${company.qualification.painPoint}`,
                company.qualification.identifiedProject && `Project: ${company.qualification.identifiedProject}`,
                company.notes && `Notes: ${company.notes}`,
              ]
                .filter(Boolean)
                .join("\n"),
            leadUserId: company.ownerId || undefined,
            track: "sales",
          });
          const inserted = await s.waitForProjectInsert(id);
          if (inserted) {
            for (const candidate of p.contacts.filter((x) => x.companyId === company.id)) {
              s.addContact(id, {
                name: candidate.name || undefined,
                email: candidate.email || undefined,
                phone: candidate.phone || undefined,
                position: candidate.title || undefined,
              });
            }
          }
          p.markPromoted(company.id, id);
          appendLog("action", `Promoted ${company.name} to project ${projectName}.`);
          return JSON.stringify({ ok: true, project_id: id, inserted, project_name: projectName });
        }

        return JSON.stringify({ ok: false, error: "Unsupported prospect action or missing required entity." });
      }

      if (name === "manage_prospecting_strategy") {
        if (!has("sales")) {
          return JSON.stringify({ ok: false, error: "Prospecting strategies require Sales permission." });
        }
        const p = s.prospecting;
        const action = stringValue(args.action);
        const strategyId = stringValue(args.strategy_id);
        if (action === "create") {
          const strategyName = stringValue(args.name);
          if (!strategyName) {
            return JSON.stringify({ ok: false, error: "Strategy name is required." });
          }
          const id = p.addStrategy({
            name: strategyName,
            ...(Array.isArray(args.markets)
              ? { markets: args.markets.filter((x): x is string => typeof x === "string") as Parameters<typeof p.addStrategy>[0]["markets"] }
              : {}),
            ...(stringValue(args.industries) ? { industries: stringValue(args.industries) } : {}),
            ...(numberValue(args.weekly_contact_target) != null
              ? { weeklyContactTarget: Math.max(0, Math.round(numberValue(args.weekly_contact_target)!)) }
              : {}),
            ...(booleanValue(args.is_active) != null ? { isActive: booleanValue(args.is_active) } : {}),
            ...(stringValue(args.notes) ? { notes: stringValue(args.notes) } : {}),
          });
          return JSON.stringify({ ok: true, strategy_id: id });
        }
        const strategy = strategyId ? p.strategies.find((x) => x.id === strategyId) : undefined;
        if (!strategy) {
          return JSON.stringify({ ok: false, error: "A valid strategy_id is required." });
        }
        if (action === "delete") {
          p.deleteStrategy(strategy.id);
          return JSON.stringify({ ok: true, deleted: "strategy", strategy_id: strategy.id });
        }
        if (action === "update") {
          const patch: Partial<typeof strategy> = {};
          if (typeof args.name === "string") patch.name = args.name.trim();
          if (Array.isArray(args.markets)) {
            patch.markets = args.markets.filter((x): x is string => typeof x === "string") as typeof strategy.markets;
          }
          if (typeof args.industries === "string") patch.industries = args.industries.trim();
          if (typeof args.weekly_contact_target === "number") {
            patch.weeklyContactTarget = Math.max(0, Math.round(args.weekly_contact_target));
          }
          if (typeof args.is_active === "boolean") patch.isActive = args.is_active;
          if (typeof args.notes === "string") patch.notes = args.notes.trim();
          p.updateStrategy(strategy.id, patch);
          return JSON.stringify({ ok: true, strategy_id: strategy.id, updated_fields: Object.keys(patch) });
        }
        return JSON.stringify({ ok: false, error: "Unsupported strategy action." });
      }

      if (name === "manage_project_finance") {
        const project = findAnyProject(args.project_id);
        if (!project || !hasFinanceProjectAccess(project)) {
          return JSON.stringify({ ok: false, error: "Project finance is not available to this user." });
        }
        const action = stringValue(args.action);
        if (action === "update_summary") {
          const patch: Parameters<typeof s.updateFinancials>[1] = {};
          const mappings = [
            ["contract_value", "contractValue"],
            ["expenses_total", "expenses"],
            ["max_materials_expense", "maxMaterialsExpense"],
            ["max_man_hr_expense", "maxManHrExpense"],
            ["opex_value", "opexValue"],
            ["opex_expense_percent", "opexExpensePercent"],
            ["warranty_years", "warrantyYears"],
            ["system_lifetime_years", "systemLifetimeYears"],
          ] as const;
          for (const [argKey, key] of mappings) {
            const value = args[argKey];
            if (value === null || typeof value === "number") {
              (patch as Record<string, unknown>)[key] = value;
            }
          }
          if (args.contract_signed_date === null) patch.contractSignedDate = null;
          else if (typeof args.contract_signed_date === "string") {
            if (!isValidDateOnly(args.contract_signed_date)) {
              return JSON.stringify({ ok: false, error: "contract_signed_date must be YYYY-MM-DD." });
            }
            patch.contractSignedDate = args.contract_signed_date;
          }
          s.updateFinancials(project.id, patch);
          return JSON.stringify({ ok: true, updated_fields: Object.keys(patch) });
        }

        if (action === "generate_incomes_from_schedule") {
          const result = s.generateIncomesFromSchedule(project.id);
          return JSON.stringify(result);
        }

        if (action === "generate_opex_schedule") {
          const result = s.generateOpexSchedule(project.id);
          return JSON.stringify(result);
        }

        if (action === "generate_material_expenses_from_incomes") {
          const result = s.generateMaterialsExpensesFromIncomes(project.id);
          return JSON.stringify(result);
        }

        if (action === "add_payment") {
          const amount = numberValue(args.amount);
          const dueDate = stringValue(args.due_date);
          if (amount == null || !dueDate || !isValidDateOnly(dueDate)) {
            return JSON.stringify({ ok: false, error: "Payment amount and valid due_date are required." });
          }
          s.addPayment(project.id, {
            amount,
            percent: nullableNumberValue(args.percent),
            dueDate,
            label: stringValue(args.label),
            milestoneId: stringValue(args.milestone_id),
            actualDate: validOptionalDate(args.actual_date),
          });
          return JSON.stringify({ ok: true, saved: "payment" });
        }

        if (action === "update_payment" || action === "delete_payment") {
          const recordId = stringValue(args.record_id);
          const payment = recordId
            ? project.financials.payments.find((x) => x.id === recordId)
            : undefined;
          if (!payment) return JSON.stringify({ ok: false, error: "Payment record not found." });
          if (action === "delete_payment") {
            s.deletePayment(project.id, payment.id);
            return JSON.stringify({ ok: true, deleted: "payment", record_id: payment.id });
          }
          const input: Parameters<typeof s.updatePayment>[2] = {
            amount: numberValue(args.amount) ?? payment.amount,
            percent:
              args.percent === null || typeof args.percent === "number"
                ? (args.percent as number | null)
                : payment.percent,
            dueDate:
              typeof args.due_date === "string" && isValidDateOnly(args.due_date)
                ? args.due_date
                : payment.dueDate,
            label: typeof args.label === "string" ? args.label.trim() : payment.label,
            milestoneId:
              args.milestone_id === null
                ? undefined
                : stringValue(args.milestone_id) ?? payment.milestoneId,
            actualDate:
              args.actual_date === null
                ? null
                : validOptionalDate(args.actual_date) ?? payment.actualDate,
          };
          s.updatePayment(project.id, payment.id, input);
          return JSON.stringify({ ok: true, record_id: payment.id });
        }

        if (action === "add_expense") {
          const amount = numberValue(args.amount);
          const dueDate = stringValue(args.due_date);
          const category = stringValue(args.category) as ProjectExpenseCategory | undefined;
          if (amount == null || !dueDate || !isValidDateOnly(dueDate) || !category) {
            return JSON.stringify({
              ok: false,
              error: "Expense amount, category, and valid due_date are required.",
            });
          }
          s.addExpense(project.id, {
            amount,
            amountExVat: nullableNumberValue(args.amount_ex_vat),
            percent: nullableNumberValue(args.percent),
            dueDate,
            label: stringValue(args.label),
            milestoneId: stringValue(args.milestone_id),
            actualDate: validOptionalDate(args.actual_date),
            category,
            subcategory: nullableStringValue(args.subcategory) as Parameters<typeof s.addExpense>[1]["subcategory"],
          });
          return JSON.stringify({ ok: true, saved: "expense" });
        }

        if (action === "update_expense" || action === "delete_expense") {
          const recordId = stringValue(args.record_id);
          const expense = recordId
            ? project.financials.expenseSchedule.find((x) => x.id === recordId)
            : undefined;
          if (!expense) return JSON.stringify({ ok: false, error: "Expense record not found." });
          if (action === "delete_expense") {
            const result = s.deleteExpense(project.id, expense.id);
            return JSON.stringify(result.ok ? { ok: true, deleted: "expense" } : result);
          }
          const input: Parameters<typeof s.updateExpense>[2] = {
            amount: numberValue(args.amount) ?? expense.amount,
            amountExVat:
              args.amount_ex_vat === null || typeof args.amount_ex_vat === "number"
                ? (args.amount_ex_vat as number | null)
                : expense.amountExVat,
            percent:
              args.percent === null || typeof args.percent === "number"
                ? (args.percent as number | null)
                : expense.percent,
            dueDate:
              typeof args.due_date === "string" && isValidDateOnly(args.due_date)
                ? args.due_date
                : expense.dueDate,
            label: typeof args.label === "string" ? args.label.trim() : expense.label,
            milestoneId:
              args.milestone_id === null
                ? undefined
                : stringValue(args.milestone_id) ?? expense.milestoneId,
            actualDate:
              args.actual_date === null
                ? null
                : validOptionalDate(args.actual_date) ?? expense.actualDate,
            category:
              (stringValue(args.category) as ProjectExpenseCategory | undefined) ??
              expense.category ??
              "materials",
            subcategory:
              args.subcategory === null
                ? null
                : (stringValue(args.subcategory) as Parameters<typeof s.updateExpense>[2]["subcategory"]) ??
                  expense.subcategory,
            warehouseLotId: expense.warehouseLotId,
          };
          s.updateExpense(project.id, expense.id, input);
          return JSON.stringify({ ok: true, record_id: expense.id });
        }

        if (action === "add_milestone") {
          const kind = stringValue(args.milestone_kind) as MilestoneKind | undefined;
          const date = stringValue(args.milestone_date);
          if (!kind || !date || !isValidDateOnly(date)) {
            return JSON.stringify({ ok: false, error: "Milestone kind and valid date are required." });
          }
          s.addMilestone(project.id, { kind, date, note: stringValue(args.note) });
          return JSON.stringify({ ok: true, saved: "milestone" });
        }

        if (action === "update_milestone" || action === "delete_milestone") {
          const recordId = stringValue(args.record_id);
          const milestone = recordId
            ? project.financials.milestones.find((x) => x.id === recordId)
            : undefined;
          if (!milestone) return JSON.stringify({ ok: false, error: "Milestone not found." });
          if (action === "delete_milestone") {
            s.deleteMilestone(project.id, milestone.id);
            return JSON.stringify({ ok: true, deleted: "milestone" });
          }
          const date =
            typeof args.milestone_date === "string" && isValidDateOnly(args.milestone_date)
              ? args.milestone_date
              : milestone.date;
          s.updateMilestone(project.id, milestone.id, {
            kind:
              (stringValue(args.milestone_kind) as MilestoneKind | undefined) ??
              milestone.kind,
            date,
            note: typeof args.note === "string" ? args.note.trim() : milestone.note,
          });
          return JSON.stringify({ ok: true, record_id: milestone.id });
        }

        return JSON.stringify({ ok: false, error: "Unsupported finance action." });
      }

      if (name === "manage_gantt") {
        const project = findAnyProject(args.project_id);
        if (!project || !hasGanttWriteAccess(project)) {
          return JSON.stringify({
            ok: false,
            error: "Editing this project schedule is not available to this user.",
          });
        }
        const action = stringValue(args.action);
        const recordId = stringValue(args.record_id);
        const phaseId = stringValue(args.phase_id);

        if (action === "add_phase") {
          const phaseName = stringValue(args.name);
          const startDate = stringValue(args.start_date);
          const duration = numberValue(args.duration_days);
          if (!phaseName || !startDate || !isValidDateOnly(startDate) || duration == null) {
            return JSON.stringify({ ok: false, error: "Phase name, start_date, and duration_days are required." });
          }
          s.addGanttPhase(project.id, {
            name: phaseName,
            startDate,
            durationDays: Math.max(1, Math.round(duration)),
            actualStartDate: validOptionalDate(args.actual_start_date),
            actualDurationDays: nullableNumberValue(args.actual_duration_days),
            wbs: stringValue(args.wbs),
            owner: stringValue(args.owner),
            sortOrder: numberValue(args.sort_order),
          });
          return JSON.stringify({ ok: true, saved: "gantt_phase" });
        }

        if (action === "update_phase" || action === "delete_phase") {
          const phase = recordId ? project.schedule.phases.find((x) => x.id === recordId) : undefined;
          if (!phase) return JSON.stringify({ ok: false, error: "Gantt phase not found." });
          if (action === "delete_phase") {
            s.deleteGanttPhase(project.id, phase.id);
            return JSON.stringify({ ok: true, deleted: "gantt_phase" });
          }
          s.updateGanttPhase(project.id, phase.id, {
            name: stringValue(args.name) ?? phase.name,
            startDate:
              typeof args.start_date === "string" && isValidDateOnly(args.start_date)
                ? args.start_date
                : phase.startDate,
            durationDays: Math.max(1, Math.round(numberValue(args.duration_days) ?? phase.durationDays)),
            actualStartDate:
              args.actual_start_date === null
                ? null
                : validOptionalDate(args.actual_start_date) ?? phase.actualStartDate,
            actualDurationDays:
              args.actual_duration_days === null
                ? null
                : numberValue(args.actual_duration_days) ?? phase.actualDurationDays,
            color: phase.color,
            wbs: typeof args.wbs === "string" ? args.wbs.trim() : phase.wbs,
            owner: typeof args.owner === "string" ? args.owner.trim() : phase.owner,
            sortOrder: numberValue(args.sort_order) ?? phase.sortOrder,
          });
          return JSON.stringify({ ok: true, record_id: phase.id });
        }

        if (action === "add_activity") {
          const activityName = stringValue(args.name);
          const startDate = stringValue(args.start_date);
          const duration = numberValue(args.duration_days);
          if (!phaseId || !activityName || !startDate || !isValidDateOnly(startDate) || duration == null) {
            return JSON.stringify({
              ok: false,
              error: "phase_id, activity name, start_date, and duration_days are required.",
            });
          }
          if (!project.schedule.phases.some((x) => x.id === phaseId)) {
            return JSON.stringify({ ok: false, error: "phase_id does not exist on this project." });
          }
          s.addGanttActivity(project.id, {
            phaseId,
            name: activityName,
            startDate,
            durationDays: Math.max(1, Math.round(duration)),
            actualStartDate: validOptionalDate(args.actual_start_date),
            actualDurationDays: nullableNumberValue(args.actual_duration_days),
            wbs: stringValue(args.wbs),
            owner: stringValue(args.owner),
            status: stringValue(args.status),
            sortOrder: numberValue(args.sort_order),
          });
          return JSON.stringify({ ok: true, saved: "gantt_activity" });
        }

        if (action === "update_activity" || action === "delete_activity") {
          const activity = recordId ? project.schedule.activities.find((x) => x.id === recordId) : undefined;
          if (!activity) return JSON.stringify({ ok: false, error: "Gantt activity not found." });
          if (action === "delete_activity") {
            s.deleteGanttActivity(project.id, activity.id);
            return JSON.stringify({ ok: true, deleted: "gantt_activity" });
          }
          const targetPhaseId = phaseId ?? activity.phaseId;
          if (!project.schedule.phases.some((x) => x.id === targetPhaseId)) {
            return JSON.stringify({ ok: false, error: "phase_id does not exist on this project." });
          }
          s.updateGanttActivity(project.id, activity.id, {
            phaseId: targetPhaseId,
            name: stringValue(args.name) ?? activity.name,
            startDate:
              typeof args.start_date === "string" && isValidDateOnly(args.start_date)
                ? args.start_date
                : activity.startDate,
            durationDays: Math.max(1, Math.round(numberValue(args.duration_days) ?? activity.durationDays)),
            actualStartDate:
              args.actual_start_date === null
                ? null
                : validOptionalDate(args.actual_start_date) ?? activity.actualStartDate,
            actualDurationDays:
              args.actual_duration_days === null
                ? null
                : numberValue(args.actual_duration_days) ?? activity.actualDurationDays,
            wbs: typeof args.wbs === "string" ? args.wbs.trim() : activity.wbs,
            owner: typeof args.owner === "string" ? args.owner.trim() : activity.owner,
            color: activity.color,
            status: typeof args.status === "string" ? args.status.trim() : activity.status,
            sortOrder: numberValue(args.sort_order) ?? activity.sortOrder,
          });
          return JSON.stringify({ ok: true, record_id: activity.id });
        }

        if (action === "add_deadline") {
          const deadlineName = stringValue(args.name);
          const date = stringValue(args.date);
          if (!phaseId || !deadlineName || !date || !isValidDateOnly(date)) {
            return JSON.stringify({ ok: false, error: "phase_id, deadline name, and valid date are required." });
          }
          if (!project.schedule.phases.some((x) => x.id === phaseId)) {
            return JSON.stringify({ ok: false, error: "phase_id does not exist on this project." });
          }
          s.addGanttDeadline(project.id, {
            phaseId,
            name: deadlineName,
            date,
            actualDate: validOptionalDate(args.actual_date),
            wbs: stringValue(args.wbs),
            owner: stringValue(args.owner),
            note: stringValue(args.note),
          });
          return JSON.stringify({ ok: true, saved: "gantt_deadline" });
        }

        if (action === "update_deadline" || action === "delete_deadline") {
          const deadline = recordId ? project.schedule.deadlines.find((x) => x.id === recordId) : undefined;
          if (!deadline) return JSON.stringify({ ok: false, error: "Gantt deadline not found." });
          if (action === "delete_deadline") {
            s.deleteGanttDeadline(project.id, deadline.id);
            return JSON.stringify({ ok: true, deleted: "gantt_deadline" });
          }
          const targetPhaseId = phaseId ?? deadline.phaseId;
          s.updateGanttDeadline(project.id, deadline.id, {
            phaseId: targetPhaseId,
            name: stringValue(args.name) ?? deadline.name,
            date:
              typeof args.date === "string" && isValidDateOnly(args.date)
                ? args.date
                : deadline.date,
            actualDate:
              args.actual_date === null
                ? null
                : validOptionalDate(args.actual_date) ?? deadline.actualDate,
            wbs: typeof args.wbs === "string" ? args.wbs.trim() : deadline.wbs,
            owner: typeof args.owner === "string" ? args.owner.trim() : deadline.owner,
            note: typeof args.note === "string" ? args.note.trim() : deadline.note,
          });
          return JSON.stringify({ ok: true, record_id: deadline.id });
        }

        if (action === "shift_schedule") {
          const amount = numberValue(args.amount);
          const unit = stringValue(args.unit) as ScheduleShiftUnit | undefined;
          if (amount == null || !unit) {
            return JSON.stringify({ ok: false, error: "Shift amount and unit are required." });
          }
          s.shiftProjectSchedule(project.id, {
            amount: Math.trunc(amount),
            unit,
            includeActuals: booleanValue(args.include_actuals),
          });
          return JSON.stringify({ ok: true, shifted: true, amount: Math.trunc(amount), unit });
        }

        return JSON.stringify({ ok: false, error: "Unsupported Gantt action." });
      }

      if (name === "manage_warehouse") {
        if (!has("warehouse")) {
          return JSON.stringify({ ok: false, error: "Warehouse access requires Warehouse permission." });
        }
        const action = stringValue(args.action);
        const payload = asRecord(args.payload);
        if (action === "receive_stock") {
          const result = s.receiveStock(payload as Parameters<typeof s.receiveStock>[0]);
          if (result.ok) appendLog("action", "Received stock into the warehouse.");
          return JSON.stringify(result);
        }
        if (action === "transfer_stock") {
          return JSON.stringify(s.transferStock(payload as Parameters<typeof s.transferStock>[0]));
        }
        if (action === "consume_stock") {
          return JSON.stringify(s.consumeStock(payload as Parameters<typeof s.consumeStock>[0]));
        }
        if (action === "adjust_stock") {
          return JSON.stringify(s.adjustStock(payload as Parameters<typeof s.adjustStock>[0]));
        }
        if (action === "update_lot") {
          return JSON.stringify(s.updateWarehouseLot(payload as Parameters<typeof s.updateWarehouseLot>[0]));
        }
        if (action === "delete_lot") {
          const lotId = stringValue(payload.lotId);
          if (!lotId) return JSON.stringify({ ok: false, error: "payload.lotId is required." });
          return JSON.stringify(s.deleteWarehouseLot(lotId));
        }
        if (action === "upsert_item") {
          const itemName = stringValue(payload.name);
          if (!itemName) return JSON.stringify({ ok: false, error: "payload.name is required." });
          const id = s.upsertWarehouseItem({
            ...(stringValue(payload.id) ? { id: stringValue(payload.id) } : {}),
            name: itemName,
            ...(stringValue(payload.sku) ? { sku: stringValue(payload.sku) } : {}),
            ...(stringValue(payload.unit) ? { unit: stringValue(payload.unit) } : {}),
            ...(stringValue(payload.defaultMaterialKind)
              ? { defaultMaterialKind: stringValue(payload.defaultMaterialKind) as WarehouseMaterialKind }
              : {}),
            ...(payload.groupId === null
              ? { groupId: null }
              : stringValue(payload.groupId)
                ? { groupId: stringValue(payload.groupId) }
                : {}),
          });
          return JSON.stringify({ ok: true, item_id: id });
        }
        if (action === "upsert_group") {
          const groupName = stringValue(payload.name);
          if (!groupName) return JSON.stringify({ ok: false, error: "payload.name is required." });
          return JSON.stringify(
            s.upsertWarehouseGroup({
              ...(stringValue(payload.id) ? { id: stringValue(payload.id) } : {}),
              name: groupName,
              ...(payload.parentId === null
                ? { parentId: null }
                : stringValue(payload.parentId)
                  ? { parentId: stringValue(payload.parentId) }
                  : {}),
            }),
          );
        }
        if (action === "delete_group") {
          const groupId = stringValue(payload.groupId);
          if (!groupId) return JSON.stringify({ ok: false, error: "payload.groupId is required." });
          return JSON.stringify(s.deleteWarehouseGroup(groupId));
        }
        if (action === "save_bom") {
          return JSON.stringify(s.saveWarehouseBom(payload as Parameters<typeof s.saveWarehouseBom>[0]));
        }
        if (action === "delete_bom") {
          const bomId = stringValue(payload.bomId);
          if (!bomId) return JSON.stringify({ ok: false, error: "payload.bomId is required." });
          return JSON.stringify(s.deleteWarehouseBom(bomId));
        }
        return JSON.stringify({ ok: false, error: "Unsupported warehouse action." });
      }

      if (name === "manage_company_settings") {
        const action = stringValue(args.action);
        const payload = asRecord(args.payload);
        if (action === "update_finance") {
          if (!has("finance")) {
            return JSON.stringify({ ok: false, error: "Company finance settings require Finance permission." });
          }
          s.updateFinanceSettings(payload as Parameters<typeof s.updateFinanceSettings>[0]);
          return JSON.stringify({ ok: true, updated: "company_finance_settings" });
        }
        if (action === "update_metrics") {
          if (!has("sales")) {
            return JSON.stringify({ ok: false, error: "Pipeline metrics settings require Sales permission." });
          }
          s.updateMetricsSettings(payload as Parameters<typeof s.updateMetricsSettings>[0]);
          return JSON.stringify({ ok: true, updated: "pipeline_metrics_settings" });
        }
        return JSON.stringify({ ok: false, error: "Unsupported company-settings action." });
      }

      if (name === "add_project_comment") {
        const project = findProject(args.project_id);
        const text = typeof args.text === "string" ? args.text.trim() : "";
        const stageChange =
          typeof args.stage_change === "string"
            ? (args.stage_change as Stage)
            : undefined;

        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!text) {
          return JSON.stringify({ ok: false, error: "Comment text is required." });
        }
        if (
          stageChange &&
          !stagesForTrack(trackOfProject(project)).includes(stageChange)
        ) {
          return JSON.stringify({
            ok: false,
            error: "That stage is not valid for this project's track.",
          });
        }

        s.addComment(project.id, text, stageChange);
        appendLog(
          "action",
          `Added update to ${project.name}${stageChange ? ` and moved it to ${STAGE_LABELS[stageChange]}` : ""}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "comment",
          stage: stageChange ?? project.stage,
        });
      }

      if (name === "create_project_task") {
        const project = findProject(args.project_id);
        const text = typeof args.text === "string" ? args.text.trim() : "";
        const kind: TodoKind = "our-action";
        const dueDate =
          typeof args.due_date === "string" && args.due_date.trim()
            ? args.due_date.trim()
            : undefined;
        const ownerUserId =
          typeof args.owner_user_id === "string" && args.owner_user_id.trim()
            ? args.owner_user_id.trim()
            : undefined;

        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!text) {
          return JSON.stringify({ ok: false, error: "Task text is required." });
        }
        if (dueDate && !isValidDateOnly(dueDate)) {
          return JSON.stringify({
            ok: false,
            error: "due_date must be a real date in YYYY-MM-DD format.",
          });
        }
        if (
          ownerUserId &&
          !assignableTeamMembers(s.teamMembers).some(
            (member) => member.id === ownerUserId,
          )
        ) {
          return JSON.stringify({
            ok: false,
            error:
              "The requested assignee is not an assignable team member. Search the team roster again.",
          });
        }

        s.addTodo(
          project.id,
          kind,
          text,
          dueDate,
          ownerUserId,
        );

        const ownerName = ownerUserId
          ? s.teamMembers.find((member) => member.id === ownerUserId)?.name
          : null;
        appendLog(
          "action",
          `Created ${TODO_KIND_LABELS[kind].toLowerCase()} on ${project.name}${dueDate ? ` due ${dueDate}` : ""}${ownerName ? ` for ${ownerName}` : ""}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "task",
          kind,
          due_date: dueDate ?? null,
          owner_user_id: ownerUserId ?? null,
          owner_name: ownerName ?? null,
        });
      }

      if (name === "change_project_stage") {
        const project = findProject(args.project_id);
        const stage =
          typeof args.stage === "string" ? (args.stage as Stage) : undefined;
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!stage || !stagesForTrack(trackOfProject(project)).includes(stage)) {
          return JSON.stringify({
            ok: false,
            error: "A valid stage for this project track is required.",
          });
        }

        s.updateProject(project.id, { stage });
        appendLog(
          "action",
          `Moved ${project.name} to ${STAGE_LABELS[stage]}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "stage",
          stage,
          stage_label: STAGE_LABELS[stage],
        });
      }

      return JSON.stringify({
        ok: false,
        error: `Unsupported CRM tool: ${name}`,
      });
    },
    [allowedProjects, appendLog],
  );

  const stopSession = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }

    toolResultsRef.current.clear();
    setStatus("off");
    setMicMuted(false);
  }, []);

  useEffect(() => {
    return () => {
      dcRef.current?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.srcObject = null;
      }
    };
  }, []);

  const sendSessionConfiguration = useCallback((dc: RTCDataChannel) => {
    const now = new Date();
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
    const localTime = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const localDate = localDateOnly(now);

    const instructions = `You are Hydr AI, the voice assistant inside the Hydrogenera CRM.

The user's local date is ${localDate}, local time is ${localTime}, timezone ${timeZone}.

Conversation style:
- Talk naturally and briefly, like a capable colleague. Do not sound like a command parser.
- The user may speak in incomplete or conversational sentences. Infer ordinary wording, but never invent CRM facts.
- If something important is unclear, ask one short follow-up question and wait for the answer.
- Do not recite internal IDs, tool names, JSON, or implementation details.

CRM safety and action rules:
- Use the CRM tools for CRM facts and actions. Do not claim an action happened unless its tool returned ok:true.
- The available tools mirror the signed-in user's CRM permissions. Never try to work around a permission error and never reveal fields that a tool withholds. In particular, financial data is only available when that user has the same Finance/EU-RnD access as the UI.
- Before any project write, search for the project unless that exact project_id was already resolved unambiguously in this conversation.
- Never guess a project, prospect, contact, task, Gantt row, finance row, warehouse lot, or assignee. Search/read first when its exact id is not already known. If several matches are plausible, ask one short clarification.
- If the user names an assignee, search the team roster unless that exact user id was already resolved in this conversation. Never invent an assignee.
- For relative dates, calculate the exact YYYY-MM-DD using the user's local date above. If the wording genuinely has two plausible dates, say the exact date you intend and ask the user to confirm.
- Voice and typed replies are one continuous conversation. During multi-step data entry, remember every field already supplied, ask only for genuinely required missing information, and continue when the user answers by either voice or text.
- Do not add unnecessary confirmations for routine, unambiguous creates/edits. Execute them and confirm concisely afterwards.
- Destructive actions such as deleting a project, prospect, contact, task, finance row, Gantt row, warehouse lot/group/BOM, or strategy must only be called when the user explicitly asks to delete/remove that exact item. Never infer deletion.
- A spoken project update should normally be stored as a project comment/update. Preserve the factual content and only clean up filler or obvious speech disfluencies.
- A spoken reminder or follow-up should normally become a project action item or prospect follow-up with the appropriate exact date.
- Only change a project stage if the user explicitly asks for it or clearly states that the stage itself has changed.
- You can create and edit project Gantt charts: phases, activities, deadlines, dates, durations, owners, WBS/status, actuals, and whole-schedule shifts, but only when the user's permissions allow the same edit in the UI.
- For 'give me an update', 'summarize the projects', 'what has happened lately', or bullet-point status requests, use get_portfolio_update. Omit project_ids for all accessible projects; pass resolved project_ids for a requested subset. Present a concise useful summary with latest happenings, current stage, open actions/blockers, and next steps.
- If the user requests an operation that genuinely cannot be completed through the available CRM tools (for example selecting a new local file for upload), explain that limitation in one sentence and continue with everything else you can do.
- After a successful write, confirm what changed in one short sentence.
`;

    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools: ALL_CRM_TOOLS,
          tool_choice: "auto",
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
            },
          },
        },
      }),
    );
  }, []);

  const startSession = useCallback(async () => {
    if (pcRef.current || status === "connecting") return;
    setError(null);
    setStatus("connecting");
    toolResultsRef.current.clear();

    try {
      if (!window.isSecureContext) {
        throw new Error(
          "Microphone access requires HTTPS (or localhost). Open the CRM over HTTPS to use voice.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone access.");
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
        void audio.play().catch(() => {
          // The session was started by a user gesture; browsers normally allow this.
        });
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          if (pcRef.current === pc) {
            setError(
              pc.connectionState === "failed"
                ? "Voice connection failed. Please reconnect."
                : null,
            );
            stopSession();
          }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        // Do not transmit speech until our CRM instructions/tools are active.
        track.enabled = false;
        pc.addTrack(track, stream);
      }

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        sendSessionConfiguration(dc);
      });

      dc.addEventListener("message", (message) => {
        void (async () => {
          let event: RealtimeEvent;
          try {
            event = JSON.parse(String(message.data)) as RealtimeEvent;
          } catch {
            return;
          }

          if (event.type === "session.updated") {
            streamRef.current?.getAudioTracks().forEach((track) => {
              track.enabled = true;
            });
            setMicMuted(false);
            setStatus("listening");
            return;
          }

          if (event.type === "input_audio_buffer.speech_started") {
            setStatus("listening");
            return;
          }

          if (
            event.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const spoken = event.transcript?.trim();
            if (spoken) appendLog("user", spoken);
            return;
          }

          if (event.type === "response.created") {
            setStatus("thinking");
            return;
          }

          if (
            event.type === "response.output_audio.delta" ||
            event.type === "response.audio.delta"
          ) {
            setStatus("speaking");
            return;
          }

          if (event.type === "error") {
            const messageText =
              event.error?.message || "The realtime voice service reported an error.";
            setError(messageText);
            appendLog("error", messageText);
            setStatus("listening");
            return;
          }

          if (event.type !== "response.done") return;

          const output = event.response?.output ?? [];
          const calls = output.filter(
            (item): item is FunctionCallItem => item.type === "function_call",
          );

          if (calls.length > 0) {
            setStatus("working");

            for (const call of calls) {
              let toolOutput = toolResultsRef.current.get(call.call_id);
              if (!toolOutput) {
                toolOutput = await executeTool(call.name, call.arguments);
                toolResultsRef.current.set(call.call_id, toolOutput);
              }

              if (dc.readyState === "open") {
                dc.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: call.call_id,
                      output: toolOutput,
                    },
                  }),
                );
              }
            }

            if (dc.readyState === "open") {
              dc.send(JSON.stringify({ type: "response.create" }));
              setStatus("thinking");
            }
            return;
          }

          const assistantText = assistantTextFromResponse(event);
          if (assistantText) appendLog("assistant", assistantText);
          setStatus("listening");
        })();
      });

      dc.addEventListener("close", () => {
        if (dcRef.current === dc) stopSession();
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch("/api/ai/voice/session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(detail?.error || `Voice connection failed (${response.status}).`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (e) {
      const messageText =
        e instanceof Error ? e.message : "Could not start the voice assistant.";
      setError(messageText);
      appendLog("error", messageText);
      stopSession();
    }
  }, [
    appendLog,
    executeTool,
    sendSessionConfiguration,
    status,
    stopSession,
  ]);

  const toggleMic = useCallback(() => {
    const nextMuted = !micMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, [micMuted]);

  const sendTypedMessage = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = typedInput.trim();
      const dc = dcRef.current;
      if (!text || !dc || dc.readyState !== "open") return;

      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        }),
      );
      dc.send(JSON.stringify({ type: "response.create" }));
      appendLog("user", text);
      setTypedInput("");
      setStatus("thinking");
    },
    [appendLog, typedInput],
  );

  const statusLabel = useMemo(() => {
    if (status === "off") return "Not connected";
    if (status === "connecting") return "Connecting…";
    if (status === "listening") return micMuted ? "Microphone muted" : "Listening";
    if (status === "thinking") return "Thinking…";
    if (status === "speaking") return "Speaking";
    return "Updating CRM…";
  }, [micMuted, status]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const scroller = logsScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [logs, panelOpen]);

  if (!enabled || !authReady || isViewer || !hasAreaAccess) {
    return null;
  }

  const connected = status !== "off" && status !== "connecting";

  const panel =
    panelOpen && mounted && typeof document !== "undefined"
      ? createPortal(
          <section
            role="dialog"
            aria-label="Hydr AI"
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              zIndex: 99999,
              width: "min(390px, calc(100vw - 2rem))",
            }}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status === "off"
                        ? "bg-muted/40"
                        : status === "connecting"
                          ? "animate-pulse bg-amber-400"
                          : "bg-teal-accent"
                    }`}
                    aria-hidden
                  />
                  <h2 className="text-sm font-bold text-deep">Hydr AI</h2>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{statusLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSession();
                  setPanelOpen(false);
                }}
                className="cursor-pointer rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-deep"
                aria-label="Close AI assistant"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="m5 5 10 10M15 5 5 15"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

          <div
            ref={logsScrollRef}
            className="min-h-40 max-h-[min(22rem,45vh)] space-y-2 overflow-y-auto overscroll-contain px-4 py-3"
          >
            {logs.length === 0 ? (
              <div className="space-y-2 text-xs leading-relaxed text-muted">
                <p className="font-semibold text-deep">
                  Speak normally — no special commands needed.
                </p>
                <p>
                  “Update Project DW: we visited the site and optimized the burners…”
                </p>
                <p>
                  “Add a task to contact Volkswagen next Thursday and assign it to Elena.”
                </p>
                <p className="text-[11px]">
                  If a project, person, or date is unclear, Hydr AI will ask you before changing the CRM.
                </p>
              </div>
            ) : (
              <>
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      entry.kind === "action"
                        ? "border border-teal-accent/20 bg-teal-soft text-deep"
                        : entry.kind === "error"
                          ? "border border-red-200 bg-red-50 text-red-700"
                          : entry.kind === "user"
                            ? "ml-8 bg-deep text-white"
                            : "mr-8 bg-surface text-deep"
                    }`}
                  >
                    {entry.kind === "action" && (
                      <span className="mr-1 font-bold text-teal-accent">CRM:</span>
                    )}
                    {entry.kind === "user" && (
                      <span className="mr-1 font-semibold text-white/70">You:</span>
                    )}
                    {entry.kind === "assistant" && (
                      <span className="mr-1 font-semibold text-teal-accent">Hydr:</span>
                    )}
                    {entry.text}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>

          {error && (
            <div className="border-t border-line bg-red-50 px-4 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}

          <div className="border-t border-line px-4 py-3">
            {status === "off" || status === "connecting" ? (
              <button
                type="button"
                disabled={status === "connecting" || !ready}
                onClick={() => void startSession()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {status === "connecting" ? "Connecting…" : "Start voice conversation"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    micMuted
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-line bg-surface text-deep hover:border-teal-accent/40"
                  }`}
                >
                  {micMuted ? "Unmute microphone" : "Mute microphone"}
                </button>
                <button
                  type="button"
                  onClick={stopSession}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:text-deep"
                >
                  Stop
                </button>
              </div>
            )}

            <form onSubmit={sendTypedMessage} className="mt-2 flex gap-2">
              <input
                value={typedInput}
                onChange={(event) => setTypedInput(event.target.value)}
                disabled={!connected}
                placeholder={
                  connected ? "Or type a CRM request…" : "Start voice to enable chat"
                }
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-deep outline-none placeholder:text-muted/60 focus:border-teal-accent disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!connected || !typedInput.trim()}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-deep transition hover:border-teal-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </section>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        title="Open Hydr AI voice assistant"
        className="inline-flex cursor-pointer shrink-0 items-center gap-1.5 rounded-lg bg-olive px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-95 sm:px-3 sm:text-xs"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path
            d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        Ask Hydr
      </button>
      {panel}
    </>
  );
}
