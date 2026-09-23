import { assignableTeamMembers, type SessionUser } from "@/lib/permissions";
import type { ProjectsApi } from "@/lib/store";
import type { ProspectingApi } from "@/lib/prospecting-store";
import {
  STAGE_LABELS,
  defaultStageForTrack,
  isInternalHiddenProject,
  stagesForTrack,
  trackOfProject,
  type MilestoneKind,
  type PersonalTodoStatus,
  type Project,
  type ProjectExpenseCategory,
  type ProjectTrack,
  type ScheduleShiftUnit,
  type Stage,
  type TeamMember,
  type WarehouseLocation,
  type WarehouseMaterialKind,
} from "@/lib/types";
import type {
  ContactMethod,
  OutreachChannel,
  OutreachResult,
  ProspectPriority,
  ProspectQualification,
  ProspectStatus,
} from "@/lib/prospecting-types";

export type VoiceActionLog = (text: string) => void;

export interface VoiceExecutorContext {
  projectsApi: ProjectsApi;
  prospectingApi: ProspectingApi;
  user: SessionUser | null;
  authEnabled: boolean;
  canWrite: boolean;
  appendAction?: VoiceActionLog;
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function projectMatchScore(query: string, project: Project): number {
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
  const matched = tokens.filter((token) => haystack.includes(token));
  score += matched.length * 12;
  if (tokens.length > 1 && matched.length === tokens.length) score += 20;
  return score;
}

function memberMatchScore(query: string, member: TeamMember): number {
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
  score += q
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => haystack.includes(token)).length * 10;
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

function localDateOnly(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function executeVoiceTool(
  ctx: VoiceExecutorContext,
  name: string,
  rawArgs: string,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ ok: false, error: "Invalid tool arguments." });
  }

  const p = ctx.projectsApi;
  const prospect = ctx.prospectingApi;
  if (!p.ready || !prospect.ready) {
    return JSON.stringify({
      ok: false,
      error: "CRM data is still loading. Ask the user to wait a moment.",
    });
  }

  const str = (key: string): string =>
    typeof args[key] === "string" ? (args[key] as string).trim() : "";
  const num = (key: string): number | undefined => {
    const raw = args[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  };
  const bool = (key: string): boolean | undefined =>
    typeof args[key] === "boolean" ? (args[key] as boolean) : undefined;
  const date = (key: string): string | null => {
    const value = str(key);
    return value && isValidDateOnly(value) ? value : null;
  };

  const currentUserId = p.currentUserId || ctx.user?.userId || null;
  const canMutate = !ctx.authEnabled || ctx.canWrite;
  const has = (permission: string): boolean =>
    !ctx.authEnabled ||
    Boolean(ctx.user?.isAdmin) ||
    Boolean(ctx.user?.permissions.includes(permission as never));

  const canGeneralProject = (project: Project): boolean => {
    if (!ctx.authEnabled) return true;
    if (!ctx.user) return false;
    if (ctx.user.isAdmin) return true;
    const track = trackOfProject(project);
    if (track === "sales") {
      return (
        ctx.user.permissions.includes("sales") ||
        ctx.user.permissions.includes("technical_sales")
      );
    }
    return ctx.user.permissions.includes("eu_funding_rnd");
  };

  const canFinanceProject = (project: Project): boolean =>
    !ctx.authEnabled ||
    Boolean(ctx.user?.isAdmin) ||
    has("finance") ||
    (trackOfProject(project) !== "sales" && has("eu_funding_rnd"));

  const canReadGanttProject = (project: Project): boolean =>
    !ctx.authEnabled ||
    Boolean(ctx.user?.isAdmin) ||
    has("production") ||
    (trackOfProject(project) === "sales"
      ? has("technical_sales")
      : has("eu_funding_rnd"));

  const canWriteGanttProject = (project: Project): boolean =>
    canMutate &&
    (!ctx.authEnabled ||
      Boolean(ctx.user?.isAdmin) ||
      (trackOfProject(project) === "sales"
        ? has("technical_sales")
        : has("eu_funding_rnd")));

  const canWarehouse = (): boolean =>
    !ctx.authEnabled || Boolean(ctx.user?.isAdmin) || has("warehouse");
  const canProspecting = (): boolean =>
    !ctx.authEnabled || Boolean(ctx.user?.isAdmin) || has("sales");
  const canSalesManager = (): boolean =>
    !ctx.authEnabled || Boolean(ctx.user?.isAdmin) || has("sales_manager");

  const referenceProjects = p.projects.filter((project) => {
    const hidden = isInternalHiddenProject(project);
    if (hidden && !(canFinanceProject(project) || canWarehouse())) return false;
    return (
      canGeneralProject(project) ||
      canFinanceProject(project) ||
      canReadGanttProject(project) ||
      canWarehouse()
    );
  });
  const generalProjects = p.projects.filter(
    (project) => !isInternalHiddenProject(project) && canGeneralProject(project),
  );
  const findReferenceProject = (id: unknown) =>
    typeof id === "string"
      ? referenceProjects.find((project) => project.id === id)
      : undefined;
  const findGeneralProject = (id: unknown) =>
    typeof id === "string"
      ? generalProjects.find((project) => project.id === id)
      : undefined;

  const assignable = assignableTeamMembers(p.teamMembers);
  const validateOwner = (id: string): boolean =>
    !id || assignable.some((member) => member.id === id);

  const parseLocation = (value: unknown): WarehouseLocation | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const site = typeof raw.site === "string" ? raw.site : "";
    const slot = typeof raw.slot === "string" ? raw.slot : "";
    if (!["ELX", "MH", "Van"].includes(site)) return null;
    if (!["project", "spare", "buffer"].includes(slot)) return null;
    const projectId =
      typeof raw.project_id === "string" && raw.project_id.trim()
        ? raw.project_id.trim()
        : undefined;
    if (slot === "project" && !projectId) return null;
    return {
      site: site as WarehouseLocation["site"],
      slot: slot as WarehouseLocation["slot"],
      ...(projectId ? { projectId } : {}),
    };
  };

  if (name === "search_projects") {
    const query = str("query");
    if (!query) {
      return JSON.stringify({ ok: false, error: "A project search query is required." });
    }
    const matches = referenceProjects
      .map((project) => ({ project, score: projectMatchScore(query, project) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ project, score }) => ({
        id: project.id,
        name: project.name,
        ...(canGeneralProject(project)
          ? {
              client: project.client,
              location: [project.city, project.country].filter(Boolean).join(", "),
            }
          : {}),
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
          ? "One clear project match was found."
          : matches.length === 0
            ? "No project matched. Ask for another project/client name."
            : "Multiple projects matched. Ask which one they mean if the target is not obvious.",
    });
  }

  if (name === "get_project") {
    const project = findReferenceProject(args.project_id);
    if (!project) {
      return JSON.stringify({
        ok: false,
        error: "Project not found or not available to this user.",
      });
    }
    const payload: Record<string, unknown> = {
      id: project.id,
      name: project.name,
      stage: project.stage,
      stage_label: STAGE_LABELS[project.stage],
      track: trackOfProject(project),
    };
    if (canGeneralProject(project)) {
      Object.assign(payload, {
        client: project.client,
        country: project.country,
        city: project.city,
        series: project.series,
        market: project.market,
        size_kw: project.sizeKw,
        base_description: project.baseDescription,
        ai_summary: project.aiSummary ?? null,
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
        recent_updates: [...project.comments]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 20)
          .map((comment) => ({
            id: comment.id,
            text: comment.text,
            author: comment.author,
            author_user_id: comment.authorUserId ?? null,
            created_at: comment.createdAt,
            stage_change: comment.stageChange ?? null,
          })),
        tasks: project.todos.map((todo) => ({
          id: todo.id,
          text: todo.text,
          answer: todo.answer ?? null,
          done: todo.done,
          due_date: todo.dueDate ?? null,
          start_date: todo.startDate ?? null,
          end_date: todo.endDate ?? null,
          owner_user_id: todo.ownerUserId ?? null,
          created_at: todo.createdAt,
          done_at: todo.doneAt ?? null,
        })),
        contacts: project.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          position: contact.position ?? "",
          created_at: contact.createdAt,
        })),
        files: project.files.map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          note: file.note ?? null,
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
          uploaded_by_name: file.uploadedByName ?? null,
          created_at: file.createdAt,
        })),
      });
    }
    if (canReadGanttProject(project)) {
      payload.schedule = project.schedule;
    }
    if (canFinanceProject(project)) {
      payload.financials = project.financials;
    }
    if (canWarehouse()) {
      const projectLotIds = new Set(
        p.warehouse.balances
          .filter(
            (balance) =>
              balance.location.slot === "project" &&
              balance.location.projectId === project.id,
          )
          .map((balance) => balance.lotId),
      );
      payload.warehouse = {
        balances: p.warehouse.balances.filter(
          (balance) =>
            (balance.location.slot === "project" &&
              balance.location.projectId === project.id) ||
            projectLotIds.has(balance.lotId),
        ),
        lots: p.warehouse.lots.filter(
          (lot) =>
            lot.purchaseProjectId === project.id || projectLotIds.has(lot.id),
        ),
      };
    }
    return JSON.stringify({ ok: true, project: payload });
  }

  if (name === "search_team_members") {
    const query = str("query");
    if (!query) {
      return JSON.stringify({
        ok: false,
        error: "A team-member search query is required.",
      });
    }
    const matches = assignable
      .map((member) => ({ member, score: memberMatchScore(query, member) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ member, score }) => ({
        id: member.id,
        name: member.name,
        username: member.username ?? null,
        email: member.email ?? null,
        score,
      }));
    return JSON.stringify({ ok: true, count: matches.length, team_members: matches });
  }

  if (name === "workspace_read") {
    const area = str("area");
    if (area === "personal_todos") {
      return JSON.stringify({
        ok: true,
        personal_todos: p.personalTodos.filter((todo) => {
          if (!ctx.authEnabled) return true;
          return Boolean(
            currentUserId &&
              (!todo.ownerUserId || todo.ownerUserId === currentUserId),
          );
        }),
      });
    }
    if (area === "finance_settings") {
      if (!has("finance")) {
        return JSON.stringify({ ok: false, error: "Finance permission is required." });
      }
      return JSON.stringify({ ok: true, finance_settings: p.financeSettings });
    }
    if (area === "metrics_settings") {
      if (!has("sales")) {
        return JSON.stringify({ ok: false, error: "Sales permission is required." });
      }
      return JSON.stringify({ ok: true, metrics_settings: p.metricsSettings });
    }
    if (area === "notifications") {
      return JSON.stringify({
        ok: true,
        notifications: p.notifications,
        unread_count: p.unreadNotificationCount,
      });
    }
    if (area === "prospecting_summary") {
      if (!canProspecting()) {
        return JSON.stringify({ ok: false, error: "Sales permission is required." });
      }
      return JSON.stringify({
        ok: true,
        kpis: prospect.kpis,
        targets: prospect.targets,
        strategies: prospect.strategies,
        company_count: prospect.companies.length,
        contact_count: prospect.contacts.length,
      });
    }
    if (area === "warehouse_summary") {
      if (!canWarehouse()) {
        return JSON.stringify({ ok: false, error: "Warehouse permission is required." });
      }
      return JSON.stringify({
        ok: true,
        counts: {
          items: p.warehouse.items.length,
          lots: p.warehouse.lots.length,
          balances: p.warehouse.balances.length,
          groups: p.warehouse.groups.length,
          serials: p.warehouse.serials.length,
          boms: p.warehouse.boms.length,
        },
        holding_project_id: p.warehouse.holdingProjectId,
      });
    }
    return JSON.stringify({ ok: false, error: "Unknown workspace area." });
  }

  if (name === "search_prospects") {
    if (!canProspecting()) {
      return JSON.stringify({ ok: false, error: "Sales permission is required." });
    }
    const query = normalizeSearch(str("query"));
    if (!query) {
      return JSON.stringify({ ok: false, error: "A prospect search query is required." });
    }
    const companies = prospect.companies
      .map((company) => {
        const haystack = normalizeSearch(
          [
            company.name,
            company.country,
            company.city,
            company.siteName,
            company.website,
            company.industry,
            company.market,
            company.system,
          ].join(" "),
        );
        let score = haystack.includes(query) ? 50 : 0;
        if (normalizeSearch(company.name) === query) score += 100;
        if (normalizeSearch(company.name).startsWith(query)) score += 60;
        return { company, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ company, score }) => ({
        id: company.id,
        name: company.name,
        location: [company.city, company.country].filter(Boolean).join(", "),
        status: company.status,
        market: company.market,
        system: company.system,
        owner_user_id: company.ownerId || null,
        promoted_project_id: company.promotedProjectId,
        score,
      }));
    const contacts = prospect.contacts
      .map((contact) => {
        const company = prospect.companies.find(
          (candidate) => candidate.id === contact.companyId,
        );
        const haystack = normalizeSearch(
          [
            contact.name,
            contact.title,
            contact.department,
            contact.email,
            contact.phone,
            company?.name ?? "",
          ].join(" "),
        );
        let score = haystack.includes(query) ? 40 : 0;
        if (normalizeSearch(contact.name) === query) score += 100;
        if (normalizeSearch(contact.email) === query) score += 100;
        return { contact, company, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ contact, company, score }) => ({
        id: contact.id,
        company_id: contact.companyId,
        company_name: company?.name ?? "",
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        status: contact.status,
        score,
      }));
    return JSON.stringify({ ok: true, companies, contacts });
  }

  if (name === "get_prospect_company") {
    if (!canProspecting()) {
      return JSON.stringify({ ok: false, error: "Sales permission is required." });
    }
    const company = prospect.companies.find(
      (candidate) => candidate.id === str("company_id"),
    );
    if (!company) {
      return JSON.stringify({ ok: false, error: "Prospect company not found." });
    }
    return JSON.stringify({
      ok: true,
      company,
      contacts: prospect.contacts.filter((contact) => contact.companyId === company.id),
      recent_activities: prospect.activities
        .filter((activity) => activity.companyId === company.id)
        .slice(0, 30),
    });
  }

  if (name === "warehouse_search") {
    if (!canWarehouse()) {
      return JSON.stringify({ ok: false, error: "Warehouse permission is required." });
    }
    const query = normalizeSearch(str("query"));
    if (!query) {
      return JSON.stringify({ ok: false, error: "A warehouse search query is required." });
    }
    const items = p.warehouse.items
      .filter((item) =>
        normalizeSearch(
          [item.name, item.sku ?? "", item.preferredSupplier ?? ""].join(" "),
        ).includes(query),
      )
      .slice(0, 20);
    const itemIds = new Set(items.map((item) => item.id));
    const lots = p.warehouse.lots
      .filter(
        (lot) =>
          itemIds.has(lot.itemId) ||
          normalizeSearch(
            [lot.supplier ?? "", lot.label ?? "", lot.notes ?? ""].join(" "),
          ).includes(query),
      )
      .slice(0, 30);
    const lotIds = new Set(lots.map((lot) => lot.id));
    return JSON.stringify({
      ok: true,
      items,
      lots,
      groups: p.warehouse.groups
        .filter((group) => normalizeSearch(group.name).includes(query))
        .slice(0, 20),
      boms: p.warehouse.boms
        .filter((bom) =>
          normalizeSearch(
            [bom.name, bom.outputGroup ?? "", bom.productFamily ?? ""].join(" "),
          ).includes(query),
        )
        .slice(0, 20),
      balances: p.warehouse.balances
        .filter((balance) => lotIds.has(balance.lotId))
        .slice(0, 50),
    });
  }

  if (name === "admin_user_action") {
    if (!ctx.authEnabled || !ctx.user?.isAdmin) {
      return JSON.stringify({ ok: false, error: "Admin access is required." });
    }
    const operation = str("operation");
    if (operation === "list") {
      const res = await fetch("/api/users", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return JSON.stringify({
        ok: res.ok,
        ...(res.ok ? data : { error: String(data.error ?? "Could not load users.") }),
      });
    }
    if (operation === "create") {
      const nameValue = str("name");
      const username = str("username");
      const password = str("password");
      if (!nameValue || !username || password.length < 8) {
        return JSON.stringify({
          ok: false,
          error:
            "Name, username, and a temporary password of at least 8 characters are required.",
        });
      }
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameValue,
          username,
          email: str("email") || undefined,
          password,
          isAdmin: bool("is_admin") ?? false,
          permissions: Array.isArray(args.permissions) ? args.permissions : [],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) await p.reloadTeamMembers();
      ctx.appendAction?.(res.ok ? `Created user ${nameValue}.` : "User creation failed.");
      return JSON.stringify({
        ok: res.ok,
        ...(res.ok
          ? { user: data.user }
          : { error: String(data.error ?? "Could not create user.") }),
      });
    }
    if (operation === "update") {
      const userId = str("user_id");
      if (!userId) {
        return JSON.stringify({ ok: false, error: "user_id is required." });
      }
      const body: Record<string, unknown> = {};
      if (args.name !== undefined) body.name = str("name");
      if (args.email !== undefined) body.email = str("email") || null;
      if (args.username !== undefined) body.username = str("username");
      if (bool("is_admin") !== undefined) body.isAdmin = bool("is_admin");
      if (bool("is_active") !== undefined) body.isActive = bool("is_active");
      if (Array.isArray(args.permissions)) body.permissions = args.permissions;
      if (str("password")) body.password = str("password");
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) await p.reloadTeamMembers();
      ctx.appendAction?.(res.ok ? "Updated user account." : "User update failed.");
      return JSON.stringify({
        ok: res.ok,
        ...(res.ok
          ? { user: data.user }
          : { error: String(data.error ?? "Could not update user.") }),
      });
    }
    return JSON.stringify({ ok: false, error: "Unknown admin operation." });
  }

  if (name === "notification_action") {
    const operation = str("operation");
    if (operation === "mark_all_read") {
      p.markAllNotificationsRead();
      return JSON.stringify({ ok: true });
    }
    const id = str("notification_id");
    if (!id) {
      return JSON.stringify({ ok: false, error: "notification_id is required." });
    }
    if (operation === "mark_read") p.markNotificationRead(id);
    else if (operation === "delete") p.deleteNotification(id);
    else return JSON.stringify({ ok: false, error: "Unknown notification operation." });
    return JSON.stringify({ ok: true });
  }

  const writeTools = new Set([
    "add_project_comment",
    "create_project_task",
    "change_project_stage",
    "project_action",
    "personal_todo_action",
    "prospect_action",
    "gantt_action",
    "finance_action",
    "warehouse_action",
    "settings_action",
  ]);
  if (writeTools.has(name) && !canMutate) {
    return JSON.stringify({
      ok: false,
      error: "This account is read-only and cannot change CRM data.",
    });
  }

  if (name === "add_project_comment") {
    const project = findGeneralProject(args.project_id);
    const textValue = str("text");
    const stageChange = str("stage_change") as Stage;
    if (!project) {
      return JSON.stringify({ ok: false, error: "Project not found or not editable by this user." });
    }
    if (!textValue) {
      return JSON.stringify({ ok: false, error: "Comment text is required." });
    }
    if (stageChange && !stagesForTrack(trackOfProject(project)).includes(stageChange)) {
      return JSON.stringify({ ok: false, error: "That stage is not valid for this project's track." });
    }
    p.addComment(project.id, textValue, stageChange || undefined);
    ctx.appendAction?.(
      `Added update to ${project.name}${stageChange ? ` and moved it to ${STAGE_LABELS[stageChange]}` : ""}.`,
    );
    return JSON.stringify({ ok: true, project_id: project.id });
  }

  if (name === "create_project_task") {
    const project = findGeneralProject(args.project_id);
    const textValue = str("text");
    if (!project || !textValue) {
      return JSON.stringify({
        ok: false,
        error: project ? "Task text is required." : "Project not found or not editable by this user.",
      });
    }
    const due = str("due_date");
    const start = str("start_date");
    const end = str("end_date");
    for (const value of [due, start, end]) {
      if (value && !isValidDateOnly(value)) {
        return JSON.stringify({ ok: false, error: "Task dates must be YYYY-MM-DD." });
      }
    }
    const owner = str("owner_user_id");
    if (owner && !validateOwner(owner)) {
      return JSON.stringify({ ok: false, error: "The requested assignee is not assignable." });
    }
    p.addTodo(
      project.id,
      "our-action",
      textValue,
      due || undefined,
      owner || undefined,
      start || undefined,
      end || undefined,
    );
    ctx.appendAction?.(`Created action item on ${project.name}.`);
    return JSON.stringify({ ok: true, project_id: project.id });
  }

  if (name === "change_project_stage") {
    const project = findGeneralProject(args.project_id);
    const stage = str("stage") as Stage;
    if (!project) {
      return JSON.stringify({ ok: false, error: "Project not found or not editable by this user." });
    }
    if (!stage || !stagesForTrack(trackOfProject(project)).includes(stage)) {
      return JSON.stringify({ ok: false, error: "A valid stage for this project track is required." });
    }
    p.updateProject(project.id, { stage });
    ctx.appendAction?.(`Moved ${project.name} to ${STAGE_LABELS[stage]}.`);
    return JSON.stringify({ ok: true, project_id: project.id, stage });
  }

  if (name === "project_action") {
    const operation = str("operation");
    if (operation === "create_project") {
      const track = (str("track") || "sales") as ProjectTrack;
      const nameValue = str("name");
      const client = str("client");
      const country = str("country");
      if (!["sales", "eu", "rnd"].includes(track)) {
        return JSON.stringify({ ok: false, error: "Invalid project track." });
      }
      const mayCreate =
        !ctx.authEnabled ||
        Boolean(ctx.user?.isAdmin) ||
        (track === "sales"
          ? has("sales") || has("technical_sales")
          : has("eu_funding_rnd"));
      if (!mayCreate) {
        return JSON.stringify({ ok: false, error: "The current user cannot create projects on that track." });
      }
      if (!nameValue || !client || !country) {
        return JSON.stringify({
          ok: false,
          error: "Project name, client/organisation, and country are required.",
          missing_fields: [
            ...(!nameValue ? ["name"] : []),
            ...(!client ? ["client"] : []),
            ...(!country ? ["country"] : []),
          ],
        });
      }
      const lead = str("lead_user_id");
      if (lead && !validateOwner(lead)) {
        return JSON.stringify({ ok: false, error: "The requested project lead is not assignable." });
      }
      const requestedStage = str("stage") as Stage;
      const stage = requestedStage || defaultStageForTrack(track);
      if (!stagesForTrack(track).includes(stage)) {
        return JSON.stringify({ ok: false, error: "That stage is not valid for the selected project track." });
      }
      const projectId = p.addProject({
        name: nameValue,
        client,
        country,
        city: str("city"),
        series: str("series") || "Z Series",
        market: str("market") || "Clean H2",
        sizeKw: Math.max(0, num("size_kw") ?? 0),
        stage,
        track,
        baseDescription: str("description"),
        ...(lead ? { leadUserId: lead } : {}),
      });
      ctx.appendAction?.(`Created project ${nameValue}.`);
      return JSON.stringify({ ok: true, project_id: projectId, name: nameValue });
    }

    const project = findGeneralProject(args.project_id);
    if (!project) {
      return JSON.stringify({ ok: false, error: "Project not found or not editable by this user." });
    }

    if (operation === "update_project") {
      const patch: Parameters<ProjectsApi["updateProject"]>[1] = {};
      if (args.name !== undefined) patch.name = str("name");
      if (args.client !== undefined) patch.client = str("client");
      if (args.country !== undefined) patch.country = str("country");
      if (args.city !== undefined) patch.city = str("city");
      if (args.series !== undefined) patch.series = str("series");
      if (args.market !== undefined) patch.market = str("market");
      if (num("size_kw") !== undefined) patch.sizeKw = Math.max(0, num("size_kw")!);
      if (args.description !== undefined) patch.baseDescription = str("description");
      if (args.stage !== undefined) {
        const stage = str("stage") as Stage;
        if (!stagesForTrack(trackOfProject(project)).includes(stage)) {
          return JSON.stringify({ ok: false, error: "That stage is not valid for this project track." });
        }
        patch.stage = stage;
      }
      if (args.lead_user_id !== undefined) {
        const owner = str("lead_user_id");
        if (owner && !validateOwner(owner)) {
          return JSON.stringify({ ok: false, error: "The requested project lead is not assignable." });
        }
        patch.leadUserId = owner || undefined;
      }
      for (const [source, target] of [
        ["last_client_contact_at", "lastClientContactAt"],
        ["cold_lead_entered_at", "coldLeadEnteredAt"],
        ["hot_lead_entered_at", "hotLeadEnteredAt"],
        ["under_development_at", "underDevelopmentAt"],
        ["commissioned_at", "commissionedAt"],
        ["cancelled_at", "cancelledAt"],
        ["last_meaningful_activity_at", "lastMeaningfulActivityAt"],
      ] as const) {
        if (args[source] === undefined) continue;
        const value = str(source);
        if (value && !isValidDateOnly(value)) {
          return JSON.stringify({ ok: false, error: `${source} must be YYYY-MM-DD or empty to clear.` });
        }
        (patch as Record<string, unknown>)[target] = value || undefined;
      }
      if (num("email_reminder_days") !== undefined) {
        patch.emailReminderDays = Math.max(1, Math.round(num("email_reminder_days")!));
      }
      if (bool("email_reminder_enabled") !== undefined) {
        patch.emailReminderEnabled = bool("email_reminder_enabled");
      }
      if (args.cancellation_reason !== undefined) {
        patch.cancellationReason = str("cancellation_reason") || undefined;
      }
      p.updateProject(project.id, patch);
      ctx.appendAction?.(`Updated ${project.name}.`);
      return JSON.stringify({ ok: true, project_id: project.id });
    }

    if (operation === "delete_project") {
      p.deleteProject(project.id);
      ctx.appendAction?.(`Deleted project ${project.name}.`);
      return JSON.stringify({ ok: true, deleted_project_id: project.id });
    }

    if (operation === "add_comment") {
      const textValue = str("text");
      if (!textValue) return JSON.stringify({ ok: false, error: "Comment text is required." });
      p.addComment(project.id, textValue);
      return JSON.stringify({ ok: true });
    }
    if (operation === "update_comment" || operation === "delete_comment") {
      const id = str("entity_id");
      if (!project.comments.some((comment) => comment.id === id)) {
        return JSON.stringify({ ok: false, error: "Comment not found." });
      }
      if (operation === "delete_comment") p.deleteComment(project.id, id);
      else {
        const textValue = str("text");
        if (!textValue) return JSON.stringify({ ok: false, error: "Comment text is required." });
        p.updateComment(project.id, id, textValue);
      }
      return JSON.stringify({ ok: true });
    }

    if (operation === "create_task") {
      const textValue = str("text");
      if (!textValue) return JSON.stringify({ ok: false, error: "Task text is required." });
      const owner = str("owner_user_id");
      if (owner && !validateOwner(owner)) {
        return JSON.stringify({ ok: false, error: "Assignee is not assignable." });
      }
      const due = str("due_date");
      const start = str("start_date");
      const end = str("end_date");
      for (const value of [due, start, end]) {
        if (value && !isValidDateOnly(value)) {
          return JSON.stringify({ ok: false, error: "Task dates must be YYYY-MM-DD." });
        }
      }
      p.addTodo(
        project.id,
        "our-action",
        textValue,
