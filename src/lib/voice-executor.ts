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

