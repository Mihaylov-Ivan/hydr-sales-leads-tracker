export interface VoiceAccessProfile {
  anyArea: boolean;
  projectGeneral: boolean;
  prospecting: boolean;
  ganttWrite: boolean;
  ganttRead: boolean;
  finance: boolean;
  warehouse: boolean;
  production: boolean;
  sales: boolean;
  salesManager: boolean;
  admin: boolean;
  canWrite: boolean;
}

const STAGES = [
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

const PROJECT_TRACKS = ["sales", "eu", "rnd"];
const TODO_STATUSES = ["cancelled", "todo", "doing", "done"];
const EXPENSE_CATEGORIES = [
  "materials",
  "man-hr",
  "installation",
  "maintenance",
  "admin",
];
const EXPENSE_SUBCATEGORIES = [
  "fuel",
  "tickets",
  "hotels",
  "travel-allowance",
  "installation-equipment",
  "maintenance-parts",
];
const PROSPECT_STATUSES = [
  "target-identified",
  "contacted",
  "follow-up-due",
  "engaged",
  "qualified",
  "promoted",
  "not-interested",
  "dormant",
  "disqualified",
];
const PROSPECT_PRIORITIES = ["high", "medium", "low"];
const OUTREACH_CHANNELS = [
  "email",
  "phone",
  "linkedin",
  "meeting",
  "video-call",
  "in-person",
  "referral",
  "tender-submission",
  "other",
];
const OUTREACH_RESULTS = [
  "outreach-sent",
  "communication-started",
  "no-response-follow-up",
  "no-response-cancel",
  "no-response",
  "positive",
  "negative",
  "requested-info",
  "requested-meeting",
  "requested-offer",
  "follow-up-later",
  "referred",
  "not-relevant",
];

export const CRM_TOOLS = [
  {
    type: "function",
    name: "search_projects",
    description:
      "Search projects visible in any area the current user can access. Results are permission-redacted. Use before project writes unless the project id is already unambiguous.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_project",
    description:
      "Read one project. The response includes only sections the logged-in user may see: general CRM, Gantt/production, finance, and/or warehouse.",
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
      "Find assignable team members by name, username, or email. Use before assigning a person unless their exact id was already resolved.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "add_project_comment",
    description:
      "Convenience action: add a project update/comment, optionally with an explicitly requested stage change.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        text: { type: "string" },
        stage_change: { type: "string", enum: STAGES },
      },
      required: ["project_id", "text"],
    },
  },
  {
    type: "function",
    name: "create_project_task",
    description:
      "Convenience action: create a project action item/reminder.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        text: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        owner_user_id: { type: "string" },
      },
      required: ["project_id", "text"],
    },
  },
  {
    type: "function",
    name: "change_project_stage",
    description:
      "Convenience action: explicitly move a resolved project to another valid stage.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        stage: { type: "string", enum: STAGES },
      },
      required: ["project_id", "stage"],
    },
  },
  {
    type: "function",
    name: "project_action",
    description:
      "Create/edit/delete project CRM data that the logged-in user can edit manually. Operations: create_project, update_project, delete_project, add_comment, update_comment, delete_comment, create_task, update_task, delete_task, toggle_task, add_contact, update_contact, delete_contact, mark_client_contacted, update_reminder, regenerate_summary, update_file_metadata, delete_file. For create_project, name/client/country are required like the UI; omitted optional values use UI defaults. For update/delete, resolve the exact project first. Destructive operations must only follow an explicit user request.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "create_project",
            "update_project",
            "delete_project",
            "add_comment",
            "update_comment",
            "delete_comment",
            "create_task",
            "update_task",
            "delete_task",
            "toggle_task",
            "add_contact",
            "update_contact",
            "delete_contact",
            "mark_client_contacted",
            "update_reminder",
            "regenerate_summary",
            "update_file_metadata",
            "delete_file",
          ],
        },
        project_id: { type: "string" },
        entity_id: {
          type: "string",
          description:
            "Comment/task/contact/file id for update/delete operations.",
        },
        track: { type: "string", enum: PROJECT_TRACKS },
        name: { type: "string" },
        client: { type: "string" },
        country: { type: "string" },
        city: { type: "string" },
        series: { type: "string" },
        market: { type: "string" },
        size_kw: { type: "number" },
        stage: { type: "string", enum: STAGES },
        description: { type: "string" },
        lead_user_id: { type: "string" },
        last_client_contact_at: { type: "string", description: "YYYY-MM-DD" },
        email_reminder_days: { type: "number" },
        email_reminder_enabled: { type: "boolean" },
        cold_lead_entered_at: { type: "string", description: "YYYY-MM-DD" },
        hot_lead_entered_at: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        under_development_at: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        commissioned_at: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        cancelled_at: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        last_meaningful_activity_at: { type: "string", description: "YYYY-MM-DD" },
        cancellation_reason: { type: "string" },
        text: { type: "string" },
        answer: { type: "string" },
        done: { type: "boolean" },
        due_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        start_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        end_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        owner_user_id: { type: "string", description: "Assignable team-member id or empty to clear" },
        contact_name: { type: "string" },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
        contact_position: { type: "string" },
        file_kind: { type: "string", enum: ["offer", "financial-model", "other"] },
        file_note: { type: "string" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "workspace_read",
    description:
      "Read non-project workspace data allowed to the user. Areas: personal_todos, finance_settings, metrics_settings, notifications, prospecting_summary, warehouse_summary. Never infer access; unavailable areas return permission denied.",
    parameters: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: [
            "personal_todos",
            "finance_settings",
            "metrics_settings",
            "notifications",
            "prospecting_summary",
            "warehouse_summary",
          ],
        },
      },
      required: ["area"],
    },
  },
  {
    type: "function",
    name: "personal_todo_action",
    description:
      "Manage the logged-in user's private To-Dos. Operations: create, update, delete, add_comment, update_comment, delete_comment, move, reorder. Never alter another user's private task.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "create",
            "update",
            "delete",
            "add_comment",
            "update_comment",
            "delete_comment",
            "move",
            "reorder",
          ],
        },
        todo_id: { type: "string" },
        comment_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: TODO_STATUSES },
        due_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        start_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        end_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        text: { type: "string" },
        direction: { type: "string", enum: ["up", "down"] },
        target_index: { type: "number" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "search_prospects",
    description:
      "Search prospecting companies and contacts by company/person/location/email. Sales permission is required.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_prospect_company",
    description:
      "Read full prospecting details for one company, its contacts, and recent outreach. Sales permission is required.",
    parameters: {
      type: "object",
      properties: {
        company_id: { type: "string" },
      },
      required: ["company_id"],
    },
  },
  {
    type: "function",
    name: "prospect_action",
    description:
      "Create/edit/delete prospecting data and pipeline activity. Operations: create_company, update_company, delete_company, add_contact, update_contact, delete_contact, log_outreach, mark_contacted, schedule_follow_up, mark_engaged, log_engagement, qualify, promote_to_sales, add_strategy, update_strategy, delete_strategy, update_targets. Company creation only requires a company name in the UI; omitted market/system/source/priority use the same UI defaults. Strategy changes require Sales Manager permission. For conversational data entry, collect any information the user says they want to include and ask for genuinely required/ambiguous values before saving.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "create_company",
            "update_company",
            "delete_company",
            "add_contact",
            "update_contact",
            "delete_contact",
            "log_outreach",
            "mark_contacted",
            "schedule_follow_up",
            "mark_engaged",
            "log_engagement",
            "qualify",
            "promote_to_sales",
            "add_strategy",
            "update_strategy",
            "delete_strategy",
            "update_targets",
          ],
        },
        company_id: { type: "string" },
        contact_id: { type: "string" },
        strategy_id: { type: "string" },
        name: { type: "string" },
        country: { type: "string" },
        city: { type: "string" },
        site_name: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        market: { type: "string" },
        system: { type: "string" },
        source: { type: "string" },
        priority: { type: "string", enum: PROSPECT_PRIORITIES },
        owner_user_id: { type: "string" },
        notes: { type: "string" },
        strategy_why: { type: "string" },
        strategy_angle: { type: "string" },
        strategy_message: { type: "string" },
        size_kw: { type: "number" },
        potential_value: { type: "number" },
        existing_relationship: { type: "string" },
        next_action: { type: "string" },
        next_action_at: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        status: { type: "string", enum: PROSPECT_STATUSES },
        contact_name: { type: "string" },
        title: { type: "string" },
        department: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        linkedin_url: { type: "string" },
        preferred_method: { type: "string", enum: ["email", "phone", "linkedin", "other"] },
        is_primary: { type: "boolean" },
        channel: { type: "string", enum: OUTREACH_CHANNELS },
        channels: {
          type: "array",
          items: { type: "string", enum: OUTREACH_CHANNELS },
        },
        result: { type: "string", enum: OUTREACH_RESULTS },
        summary: { type: "string" },
        follow_up_at: { type: "string", description: "YYYY-MM-DD" },
        follow_up_reason: { type: "string" },
        occurred_at: { type: "string" },
        qualification: {
          type: "object",
          properties: {
            identifiedProject: { type: "string" },
            system: { type: "string" },
            existingFuelOrH2Use: { type: "string" },
            energyOrH2Requirement: { type: "string" },
            existingEquipment: { type: "string" },
            painPoint: { type: "string" },
            projectTiming: { type: "string" },
            budgetKnown: { type: "string", enum: ["yes", "no", "unknown"] },
            fundingNeeded: { type: "string", enum: ["yes", "no", "unknown"] },
            decisionMakerIdentified: { type: "string", enum: ["yes", "no", "unknown"] },
            technicalContactIdentified: { type: "string", enum: ["yes", "no", "unknown"] },
            clientRequested: { type: "array", items: { type: "string" } },
            estimatedValue: { type: "number" },
            confidence: { type: "number" },
            notes: { type: "string" },
          },
        },
        strategy_name: { type: "string" },
        strategy_markets: { type: "array", items: { type: "string" } },
        strategy_industries: { type: "string" },
        weekly_contact_target: { type: "number" },
        strategy_notes: { type: "string" },
        strategy_active: { type: "boolean" },
        monthly_contact_target: { type: "number" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "gantt_action",
    description:
      "Create/edit/delete project Gantt phases, activities, deadlines, or shift the entire schedule. Operations: create_phase, update_phase, delete_phase, create_activity, update_activity, delete_activity, create_deadline, update_deadline, delete_deadline, shift_schedule. Read the project first to resolve phase/activity/deadline ids. Write access follows the same project Gantt permissions as the UI.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "create_phase",
            "update_phase",
            "delete_phase",
            "create_activity",
            "update_activity",
            "delete_activity",
            "create_deadline",
            "update_deadline",
            "delete_deadline",
            "shift_schedule",
          ],
        },
        project_id: { type: "string" },
        entity_id: { type: "string" },
        phase_id: { type: "string" },
        name: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        duration_days: { type: "number" },
        actual_start_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        actual_duration_days: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD" },
        actual_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        wbs: { type: "string" },
        owner: { type: "string" },
        note: { type: "string" },
        color: { type: "string" },
        status: { type: "string" },
        sort_order: { type: "number" },
        shift_amount: { type: "number" },
        shift_unit: { type: "string", enum: ["days", "weeks", "months"] },
        include_actuals: { type: "boolean" },
      },
      required: ["operation", "project_id"],
    },
  },
  {
    type: "function",
    name: "finance_action",
    description:
      "Read/write finance-related project data only when the logged-in user has Finance permission, or for EU/RnD projects when their EU/R&D access allows it in the UI. Operations: update_project_financials, add_payment, update_payment, delete_payment, add_expense, update_expense, delete_expense, generate_incomes_from_schedule, generate_opex_schedule, generate_materials_expenses, update_company_settings, add_milestone, update_milestone, delete_milestone. Never expose finance data through another tool when this permission check fails.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "update_project_financials",
            "add_payment",
            "update_payment",
            "delete_payment",
            "add_expense",
            "update_expense",
            "delete_expense",
            "generate_incomes_from_schedule",
            "generate_opex_schedule",
            "generate_materials_expenses",
            "update_company_settings",
            "add_milestone",
            "update_milestone",
            "delete_milestone",
          ],
        },
        project_id: { type: "string" },
        entity_id: { type: "string" },
        contract_value: { type: "number" },
        contract_signed_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        expenses: { type: "number" },
        expected_profit: { type: "number" },
        max_materials_expense: { type: "number" },
        max_man_hr_expense: { type: "number" },
        opex_value: { type: "number" },
        opex_expense_percent: { type: "number" },
        warranty_years: { type: "number" },
        system_lifetime_years: { type: "number" },
        amount: { type: "number" },
        amount_ex_vat: { type: "number" },
        percent: { type: "number" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        actual_date: { type: "string", description: "YYYY-MM-DD or empty to clear" },
        label: { type: "string" },
        milestone_id: { type: "string" },
        is_maintenance: { type: "boolean" },
        category: { type: "string", enum: EXPENSE_CATEGORIES },
        subcategory: { type: "string", enum: EXPENSE_SUBCATEGORIES },
        warehouse_lot_id: { type: "string" },
        opening_cash: { type: "number" },
        opening_cash_as_of: { type: "string", description: "YYYY-MM" },
        min_working_capital: { type: "number" },
        stage_probabilities: { type: "object" },
        monthly_expenses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              month: { type: "string", description: "YYYY-MM" },
              fixedMonthly: { type: "number" },
              status: { type: "string", enum: ["actual", "projected"] },
            },
            required: ["month", "fixedMonthly", "status"],
          },
        },
        milestone_kind: {
          type: "string",
          enum: [
            "contract-signed",
            "engineering-done",
            "manufacturing-done",
            "fat",
            "sat",
            "commissioned",
          ],
        },
        milestone_date: { type: "string", description: "YYYY-MM-DD" },
        note: { type: "string" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "warehouse_search",
    description:
      "Search warehouse catalog items, lots, groups, BOMs and balances. Warehouse permission is required. Query may be an item name, SKU, supplier, lot label, group or BOM name.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "warehouse_action",
    description:
      "Manage warehouse data with the same Warehouse permission as the UI. Operations: receive_stock, transfer_stock, consume_stock, adjust_stock, update_lot, delete_lot, upsert_item, upsert_group, delete_group, save_bom, duplicate_bom, delete_bom. Resolve item/lot/group/BOM/project ids before writing. Stock reductions/deletions and destructive catalog/BOM changes require explicit user intent.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
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
            "duplicate_bom",
            "delete_bom",
          ],
        },
        lot_id: { type: "string" },
        item_id: { type: "string" },
        group_id: { type: "string" },
        bom_id: { type: "string" },
        name: { type: "string" },
        sku: { type: "string" },
        unit: { type: "string" },
        default_material_kind: { type: "string", enum: ["materials", "installation", "maintenance"] },
        parent_id: { type: "string" },
        qty: { type: "number" },
        new_qty: { type: "number" },
        unit_cost_inc_vat: { type: "number" },
        unit_cost_ex_vat: { type: "number" },
        received_at: { type: "string", description: "YYYY-MM-DD" },
        material_kind: { type: "string", enum: ["materials", "installation", "maintenance"] },
        destination: {
          type: "object",
          properties: {
            site: { type: "string", enum: ["ELX", "MH", "Van"] },
            slot: { type: "string", enum: ["project", "spare", "buffer"] },
            project_id: { type: "string" },
          },
          required: ["site", "slot"],
        },
        from: {
          type: "object",
          properties: {
            site: { type: "string", enum: ["ELX", "MH", "Van"] },
            slot: { type: "string", enum: ["project", "spare", "buffer"] },
            project_id: { type: "string" },
          },
          required: ["site", "slot"],
        },
        to: {
          type: "object",
          properties: {
            site: { type: "string", enum: ["ELX", "MH", "Van"] },
            slot: { type: "string", enum: ["project", "spare", "buffer"] },
            project_id: { type: "string" },
          },
          required: ["site", "slot"],
        },
        expense_mode: { type: "string", enum: ["create", "link"] },
        expense_project_id: { type: "string" },
        expense_id: { type: "string" },
        label: { type: "string" },
        supplier: { type: "string" },
        notes: { type: "string" },
        actual_date: { type: "string", description: "YYYY-MM-DD" },
        purchase_project_id: { type: "string" },
        output_group: { type: "string" },
        product_family: { type: "string" },
        output_item_id: { type: "string" },
        qty_produced: { type: "number" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              componentName: { type: "string" },
              componentGroup: { type: "string" },
              componentItemId: { type: "string" },
              qtyPerUnit: { type: "number" },
              unitCost: { type: "number" },
            },
            required: ["componentName", "qtyPerUnit"],
          },
        },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "settings_action",
    description:
      "Update sales pipeline metrics settings when the user has Sales permission. Operation: update_metrics_settings.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["update_metrics_settings"] },
        stale_cold_days: { type: "number" },
        stale_hot_days: { type: "number" },
        stale_under_development_days: { type: "number" },
        maturity_under_development_months: { type: "number" },
        maturity_commissioned_months: { type: "number" },
        healthy_conversion_probability: { type: "number" },
        stale_recovery_probability: { type: "number" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "notification_action",
    description:
      "Read/manage the logged-in user's in-app notifications. Operations: mark_read, mark_all_read, delete.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["mark_read", "mark_all_read", "delete"] },
        notification_id: { type: "string" },
      },
      required: ["operation"],
    },
  },
  {
    type: "function",
    name: "admin_user_action",
    description:
      "Admin-only user management matching the Users admin page. Operations: list, create, update. Creating a user requires name, username and a temporary password of at least 8 characters. Updating admin status, permissions, activation or password is high impact: only do it after the user's request is explicit and unambiguous. Never repeat a password in the response.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["list", "create", "update"] },
        user_id: { type: "string" },
        name: { type: "string" },
        username: { type: "string" },
        email: { type: "string" },
        password: { type: "string" },
        is_admin: { type: "boolean" },
        is_active: { type: "boolean" },
        permissions: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "sales",
              "finance",
              "warehouse",
              "production",
              "technical_sales",
              "eu_funding_rnd",
              "sales_manager",
              "viewer",
            ],
          },
        },
      },
      required: ["operation"],
    },
  },
] as const;

const PROJECT_TOOL_NAMES = new Set([
  "search_projects",
  "get_project",
  "search_team_members",
  "add_project_comment",
  "create_project_task",
  "change_project_stage",
  "project_action",
]);

export function voiceToolsForAccess(profile: VoiceAccessProfile) {
  return CRM_TOOLS.filter((tool) => {
    if (tool.name === "admin_user_action") return profile.admin;
    if (tool.name === "search_prospects" || tool.name === "get_prospect_company") {
      return profile.prospecting;
    }
    if (tool.name === "prospect_action") return profile.prospecting;
    if (tool.name === "gantt_action") return profile.ganttWrite && profile.canWrite;
    if (tool.name === "finance_action") return profile.finance;
    if (tool.name === "warehouse_search") return profile.warehouse;
    if (tool.name === "warehouse_action") return profile.warehouse && profile.canWrite;
    if (tool.name === "settings_action") return profile.sales && profile.canWrite;
    if (tool.name === "personal_todo_action") return profile.canWrite;
    if (tool.name === "notification_action") return profile.anyArea;
    if (tool.name === "workspace_read") return profile.anyArea;
    if (PROJECT_TOOL_NAMES.has(tool.name)) {
      if (tool.name === "search_projects" || tool.name === "get_project") {
        return (
          profile.projectGeneral ||
          profile.finance ||
          profile.warehouse ||
          profile.ganttRead ||
          profile.production
        );
      }
      if (tool.name === "search_team_members") return profile.anyArea;
      return profile.projectGeneral && profile.canWrite;
    }
    return profile.anyArea;
  });
}
