import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
} from "@/lib/auth";
import {
  createServiceClient,
  hasServiceRoleConfig,
} from "@/lib/supabase-server";
import {
  generateProjectSummary,
  type ProjectSummaryInput,
} from "@/lib/project-summary-server";
import { isProjectSummaryEnabled } from "@/lib/summary";

export const runtime = "nodejs";

function bearer(request: NextRequest): string {
  const value = request.headers.get("authorization")?.trim() ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function authorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.AI_SUMMARY_CRON_SECRET?.trim();
  if (cronSecret && bearer(request) === cronSecret) return true;

  if (!isAuthEnabled()) return true;
  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  return Boolean(payload?.isAdmin);
}

function byProject(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const id = typeof row.project_id === "string" ? row.project_id : "";
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      out[index] = await fn(values[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return out;
}

export async function POST(request: NextRequest) {
  if (!isProjectSummaryEnabled()) {
    return NextResponse.json(
      { error: "AI project summaries are disabled." },
      { status: 503 },
    );
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }
  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      { error: "Database service role is not configured." },
      { status: 503 },
    );
  }
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body means all projects.
  }
  const requestedIds = Array.isArray(body.project_ids)
    ? body.project_ids.filter((x): x is string => typeof x === "string")
    : [];

  const db = createServiceClient();
  let projectQuery = db
    .from("projects")
    .select("*")
    .eq("is_warehouse_holding", false)
    .order("created_at", { ascending: true });
  if (requestedIds.length > 0) projectQuery = projectQuery.in("id", requestedIds);

  const { data: projects, error: projectsError } = await projectQuery;
  if (projectsError) {
    console.error("Bulk summary project load failed:", projectsError);
    return NextResponse.json(
      { error: "Could not load projects for summary refresh." },
      { status: 500 },
    );
  }

  const ids = (projects ?? []).map((project) => String(project.id));
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, failed: 0, results: [] });
  }

  const safeRows = async (table: string) => {
    const result = await db.from(table).select("*").in("project_id", ids);
    if (result.error) {
      console.error(`Bulk summary ${table} load failed:`, result.error);
      return [] as Record<string, unknown>[];
    }
    return (result.data ?? []) as Record<string, unknown>[];
  };

  const [commentsRows, todoRows, contactRows, fileRows, phaseRows, activityRows, deadlineRows] =
    await Promise.all([
      safeRows("project_comments"),
      safeRows("project_todos"),
      safeRows("project_contacts"),
      safeRows("project_files"),
      safeRows("project_gantt_phases"),
      safeRows("project_gantt_activities"),
      safeRows("project_gantt_deadlines"),
    ]);

  const comments = byProject(commentsRows);
  const todos = byProject(todoRows);
  const contacts = byProject(contactRows);
  const files = byProject(fileRows);
  const phases = byProject(phaseRows);
  const activities = byProject(activityRows);
  const deadlines = byProject(deadlineRows);

  const inputs: ProjectSummaryInput[] = (projects ?? []).map((project) => {
    const id = String(project.id);
    return {
      id,
      name: String(project.name ?? ""),
      client: String(project.client ?? ""),
      country: String(project.country ?? ""),
      city: String(project.city ?? ""),
      series: String(project.series ?? ""),
      market: String(project.market ?? ""),
      sizeKw: numberOr(project.size_kw),
      stage: String(project.stage ?? "cold-lead"),
      track: String(project.project_track ?? "sales"),
      baseDescription: String(project.base_description ?? ""),
      lastMeaningfulActivityAt:
        typeof project.last_meaningful_activity_at === "string"
          ? project.last_meaningful_activity_at
          : null,
      comments: (comments.get(id) ?? []).map((row) => ({
        text: String(row.text ?? ""),
        author: typeof row.author === "string" ? row.author : null,
        createdAt: String(row.created_at ?? ""),
        stageChange:
          typeof row.stage_change === "string" ? row.stage_change : null,
      })),
      todos: (todos.get(id) ?? []).map((row) => ({
        text: String(row.text ?? ""),
        answer: typeof row.answer === "string" ? row.answer : null,
        done: row.done === true,
        dueDate: typeof row.due_date === "string" ? row.due_date : null,
        startDate: typeof row.start_date === "string" ? row.start_date : null,
        endDate: typeof row.end_date === "string" ? row.end_date : null,
        ownerUserId:
          typeof row.owner_user_id === "string" ? row.owner_user_id : null,
        createdAt:
          typeof row.created_at === "string" ? row.created_at : null,
        doneAt: typeof row.done_at === "string" ? row.done_at : null,
      })),
      contacts: (contacts.get(id) ?? []).map((row) => ({
        name: typeof row.name === "string" ? row.name : null,
        email: typeof row.email === "string" ? row.email : null,
        phone: typeof row.phone === "string" ? row.phone : null,
        position: typeof row.position === "string" ? row.position : null,
      })),
      files: (files.get(id) ?? []).map((row) => ({
        name: String(row.name ?? ""),
        kind: typeof row.kind === "string" ? row.kind : null,
        note: typeof row.note === "string" ? row.note : null,
        createdAt:
          typeof row.created_at === "string" ? row.created_at : null,
      })),
      schedule: {
        phases: (phases.get(id) ?? []).map((row) => ({
          name: String(row.name ?? ""),
          startDate: String(row.start_date ?? ""),
          durationDays: numberOr(row.duration_days, 1),
          actualStartDate:
            typeof row.actual_start_date === "string"
              ? row.actual_start_date
              : null,
          actualDurationDays:
            typeof row.actual_duration_days === "number"
              ? row.actual_duration_days
              : null,
          owner: typeof row.owner === "string" ? row.owner : null,
          wbs: typeof row.wbs === "string" ? row.wbs : null,
        })),
        activities: (activities.get(id) ?? []).map((row) => ({
          name: String(row.name ?? ""),
          phaseId: typeof row.phase_id === "string" ? row.phase_id : null,
          startDate: String(row.start_date ?? ""),
          durationDays: numberOr(row.duration_days, 1),
          actualStartDate:
            typeof row.actual_start_date === "string"
              ? row.actual_start_date
              : null,
          actualDurationDays:
            typeof row.actual_duration_days === "number"
              ? row.actual_duration_days
              : null,
          owner: typeof row.owner === "string" ? row.owner : null,
          wbs: typeof row.wbs === "string" ? row.wbs : null,
          status: typeof row.status === "string" ? row.status : null,
        })),
        deadlines: (deadlines.get(id) ?? []).map((row) => ({
          name: String(row.name ?? ""),
          phaseId: typeof row.phase_id === "string" ? row.phase_id : null,
          date: String(row.date ?? ""),
          actualDate:
            typeof row.actual_date === "string" ? row.actual_date : null,
          owner: typeof row.owner === "string" ? row.owner : null,
          wbs: typeof row.wbs === "string" ? row.wbs : null,
          note: typeof row.note === "string" ? row.note : null,
        })),
      },
    };
  });

  const concurrency = Math.min(
    6,
    Math.max(
      1,
      Number(process.env.AI_PROJECT_SUMMARY_CONCURRENCY || 3) || 3,
    ),
  );

  const results = await mapLimit(inputs, concurrency, async (project) => {
    try {
      const summary = await generateProjectSummary(project);
      const now = new Date().toISOString();
      const { error } = await db
        .from("projects")
        .update({
          ai_summary: summary,
          ai_summary_updated_at: now,
        })
        .eq("id", project.id);
      if (error) throw error;
      return {
        project_id: project.id,
        project_name: project.name,
        ok: true,
        updated_at: now,
      };
    } catch (error) {
      console.error(`Summary refresh failed for ${project.name}:`, error);
      return {
        project_id: project.id,
        project_name: project.name,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  const updated = results.filter((result) => result.ok).length;
  return NextResponse.json({
    ok: updated === results.length,
    updated,
    failed: results.length - updated,
    results,
  });
}
