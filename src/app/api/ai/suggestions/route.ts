import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { isViewerUser, type SessionUser } from "@/lib/permissions";
import {
  createServiceClient,
  hasServiceRoleConfig,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

const OPERATIONS = new Set([
  "add_project_comment",
  "update_project_fields",
  "create_project_task",
  "add_project_contact",
  "update_project_contact",
  "change_project_stage",
  "clarification",
]);

const STATUSES = new Set([
  "pending",
  "needs-clarification",
  "applied",
  "rejected",
]);

const CONFIDENCE = new Set(["high", "medium", "low"]);

type AuthContext = {
  userId: string;
  user: SessionUser | null;
  authEnabled: boolean;
};

async function requireUser(request: NextRequest): Promise<
  { auth: AuthContext } | { error: NextResponse }
> {
  if (!hasServiceRoleConfig()) {
    return {
      error: NextResponse.json(
        { error: "Database service role is not configured." },
        { status: 503 },
      ),
    };
  }

  if (!isAuthEnabled()) {
    return {
      auth: {
        userId: "local-admin",
        user: null,
        authEnabled: false,
      },
    };
  }

  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  if (!payload) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  const user = sessionUserFromPayload(payload);
  if (isViewerUser(user)) {
    return {
      error: NextResponse.json(
        { error: "Viewer accounts cannot use AI CRM suggestions." },
        { status: 403 },
      ),
    };
  }
  return {
    auth: {
      userId: user.userId,
      user,
      authEnabled: true,
    },
  };
}

function canAccessProject(
  auth: AuthContext,
  project: { project_track?: string | null },
): boolean {
  if (!auth.authEnabled || auth.user?.isAdmin) return true;
  const permissions = auth.user?.permissions ?? [];
  const track = project.project_track ?? "sales";
  if (track === "sales") {
    return (
      permissions.includes("sales") ||
      permissions.includes("technical_sales")
    );
  }
  return permissions.includes("eu_funding_rnd");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((key) => [key, stable(obj[key])]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function normalizeSemanticText(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim().replace(/\\s+/g, " ")
    : "";
}

function semanticMergeKey(
  operation: string,
  payload: Record<string, unknown>,
  title: string,
  explicit?: string,
): string {
  const provided = normalizeSemanticText(explicit);
  if (provided) return operation + ":explicit:" + provided;

  if (operation === "create_project_task") {
    return operation + ":text:" + normalizeSemanticText(payload.text);
  }
  if (operation === "add_project_contact") {
    return (
      operation +
      ":contact:" +
      (normalizeSemanticText(payload.email) || normalizeSemanticText(payload.name))
    );
  }
  if (operation === "update_project_contact") {
    return operation + ":contact:" + normalizeSemanticText(payload.contact_id);
  }
  if (operation === "change_project_stage") {
    return operation + ":single";
  }
  if (operation === "update_project_fields") {
    const fields = asObject(payload.fields);
    return operation + ":fields:" + Object.keys(fields).sort().join(",");
  }
  if (operation === "clarification") {
    return (
      operation +
      ":question:" +
      (normalizeSemanticText(payload.question) || normalizeSemanticText(title))
    );
  }
  return operation + ":title:" + normalizeSemanticText(title);
}

function mergedSourceLabel(existing: unknown, next: string): string {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (!current) return next;
  if (!next || current === next) return current;
  const parts = current.split(" · ").map((x) => x.trim()).filter(Boolean);
  if (!parts.includes(next)) parts.push(next);
  return parts.join(" · ").slice(0, 300);
}

function mergedSourceExcerpt(existing: unknown, next: string): string {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (!current) return next;
  if (!next || current.includes(next)) return current.slice(0, 1000);
  return (current + "\n\n" + next).slice(0, 1000);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  const checked = await requireUser(request);
  if ("error" in checked) return checked.error;

  const db = createServiceClient();
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const projectId = url.searchParams.get("project_id")?.trim();
  const status = url.searchParams.get("status")?.trim() || "actionable";
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") || 30) || 30),
  );

  let query = db
    .from("ai_suggested_updates")
    .select("*")
    .eq("user_id", checked.auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (id) query = query.eq("id", id);
  if (projectId) query = query.eq("project_id", projectId);
  if (status === "actionable") {
    query = query.in("status", ["pending", "needs-clarification"]);
  } else if (STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("AI suggestion queue load failed:", error);
    return NextResponse.json(
      { error: "Could not load AI suggestion queue." },
      { status: 500 },
    );
  }

  if (id) {
    return NextResponse.json({ suggestion: data?.[0] ?? null });
  }
  return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const checked = await requireUser(request);
  if ("error" in checked) return checked.error;

  let body: Record<string, unknown>;
  try {
    body = asObject(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sourceContent =
    typeof body.source_content === "string" ? body.source_content.trim() : "";
  const sourceLabel =
    typeof body.source_label === "string"
      ? body.source_label.trim().slice(0, 300)
      : "Pasted email";
  const rawSuggestions = Array.isArray(body.suggestions)
    ? body.suggestions.slice(0, 50)
    : [];

  if (!sourceContent) {
    return NextResponse.json(
      { error: "source_content is required." },
      { status: 400 },
    );
  }
  if (rawSuggestions.length === 0) {
    return NextResponse.json(
      { error: "At least one structured suggestion is required." },
      { status: 400 },
    );
  }

  const normalized = rawSuggestions
    .map(asObject)
    .map((suggestion) => ({
      projectId:
        typeof suggestion.project_id === "string"
          ? suggestion.project_id.trim()
          : "",
      operation:
        typeof suggestion.operation === "string"
          ? suggestion.operation.trim()
          : "",
      title:
        typeof suggestion.title === "string"
          ? suggestion.title.trim().slice(0, 500)
          : "",
      rationale:
        typeof suggestion.rationale === "string"
          ? suggestion.rationale.trim().slice(0, 2000)
          : null,
      confidence:
        typeof suggestion.confidence === "string" &&
        CONFIDENCE.has(suggestion.confidence)
          ? suggestion.confidence
          : "medium",
      payload: asObject(suggestion.payload),
      mergeKey:
        typeof suggestion.merge_key === "string"
          ? suggestion.merge_key.trim().slice(0, 300)
          : "",
      existingValue:
        suggestion.existing_value === undefined
          ? null
          : suggestion.existing_value,
      proposedValue:
        suggestion.proposed_value === undefined
          ? null
          : suggestion.proposed_value,
    }))
    .filter(
      (suggestion) =>
        suggestion.projectId &&
        suggestion.title &&
        OPERATIONS.has(suggestion.operation),
    );

  if (normalized.length === 0) {
    return NextResponse.json(
      { error: "No valid suggestions were supplied." },
      { status: 400 },
    );
  }

  const projectIds = [...new Set(normalized.map((x) => x.projectId))];
  const db = createServiceClient();
  const { data: projectRows, error: projectError } = await db
    .from("projects")
    .select("id, project_track")
    .in("id", projectIds);

  if (projectError) {
    console.error("AI suggestion project lookup failed:", projectError);
    return NextResponse.json(
      { error: "Could not validate suggestion projects." },
      { status: 500 },
    );
  }

  const projectMap = new Map(
    (projectRows ?? []).map((row) => [String(row.id), row]),
  );
  const sourceHash = sha256(sourceContent);
  const sourceExcerpt = sourceContent.replace(/\s+/g, " ").slice(0, 1000);
  const batchId = randomUUID();
  const created: unknown[] = [];
  const duplicates: unknown[] = [];
  const rejected: Array<{ project_id: string; error: string }> = [];

  for (const suggestion of normalized) {
    const project = projectMap.get(suggestion.projectId);
    if (!project) {
      rejected.push({
        project_id: suggestion.projectId,
        error: "Project does not exist.",
      });
      continue;
    }
    if (!canAccessProject(checked.auth, project)) {
      rejected.push({
        project_id: suggestion.projectId,
        error: "Project is not available to this user.",
      });
      continue;
    }

    const dedupeKey = sha256(
      stableJson({
        operation: suggestion.operation,
        payload: suggestion.payload,
      }),
    );
    const status =
      suggestion.operation === "clarification"
        ? "needs-clarification"
        : "pending";

    // Reconcile against still-actionable AI proposals before inserting a new row.
    // This keeps the review queue synchronized when later sources refine the same
    // task/contact/field/stage/update before a human has approved it.
    const semanticKey = semanticMergeKey(
      suggestion.operation,
      suggestion.payload,
      suggestion.title,
      suggestion.mergeKey,
    );
    const { data: actionableRows, error: actionableError } = await db
      .from("ai_suggested_updates")
      .select("*")
      .eq("user_id", checked.auth.userId)
      .eq("project_id", suggestion.projectId)
      .eq("operation", suggestion.operation)
      .in("status", ["pending", "needs-clarification"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (actionableError) {
      console.error("AI suggestion reconciliation lookup failed:", actionableError);
      rejected.push({
        project_id: suggestion.projectId,
        error: "Could not reconcile pending AI suggestions.",
      });
      continue;
    }

    const mergeTarget = (actionableRows ?? []).find((row) => {
      const rowPayload = asObject(row.payload);
      return (
        semanticMergeKey(
          String(row.operation ?? ""),
          rowPayload,
          String(row.title ?? ""),
        ) === semanticKey
      );
    });

    if (mergeTarget) {
      const { data: merged, error: mergeError } = await db
        .from("ai_suggested_updates")
        .update({
          batch_id: batchId,
          source_label: mergedSourceLabel(mergeTarget.source_label, sourceLabel),
          source_hash: sourceHash,
          source_excerpt: mergedSourceExcerpt(
            mergeTarget.source_excerpt,
            sourceExcerpt,
          ),
          title: suggestion.title,
          rationale: suggestion.rationale,
          confidence: suggestion.confidence,
          payload: suggestion.payload,
          existing_value:
            mergeTarget.existing_value ?? suggestion.existingValue,
          proposed_value: suggestion.proposedValue,
          status,
          review_note: null,
          reviewed_at: null,
          applied_at: null,
        })
        .eq("id", mergeTarget.id)
        .eq("user_id", checked.auth.userId)
        .select("*")
        .single();

      if (mergeError) {
        console.error("AI suggestion reconciliation update failed:", mergeError);
        rejected.push({
          project_id: suggestion.projectId,
          error: "Could not merge a pending AI suggestion.",
        });
        continue;
      }
      created.push(merged);
      continue;
    }

    const { data: existing, error: existingError } = await db
      .from("ai_suggested_updates")
      .select("*")
      .eq("user_id", checked.auth.userId)
      .eq("project_id", suggestion.projectId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existingError) {
      console.error("AI suggestion dedupe lookup failed:", existingError);
      rejected.push({
        project_id: suggestion.projectId,
        error: "Could not check suggestion duplicates.",
      });
      continue;
    }

    if (existing) {
      if (existing.status === "rejected") {
        const { data: revived, error: reviveError } = await db
          .from("ai_suggested_updates")
          .update({
            batch_id: batchId,
            source_label: sourceLabel,
            source_hash: sourceHash,
            source_excerpt: sourceExcerpt,
            title: suggestion.title,
            rationale: suggestion.rationale,
            confidence: suggestion.confidence,
            payload: suggestion.payload,
            existing_value: suggestion.existingValue,
            proposed_value: suggestion.proposedValue,
            status,
            review_note: null,
            reviewed_at: null,
            applied_at: null,
            created_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("user_id", checked.auth.userId)
          .select("*")
          .single();
        if (reviveError) {
          console.error("AI suggestion revive failed:", reviveError);
          rejected.push({
            project_id: suggestion.projectId,
            error: "Could not re-open a previously rejected suggestion.",
          });
          continue;
        }
        created.push(revived);
      } else {
        duplicates.push(existing);
      }
      continue;
    }

    const { data: inserted, error: insertError } = await db
      .from("ai_suggested_updates")
      .insert({
        batch_id: batchId,
        user_id: checked.auth.userId,
        project_id: suggestion.projectId,
        source_type: "manual-email",
        source_label: sourceLabel,
        source_hash: sourceHash,
        source_excerpt: sourceExcerpt,
        operation: suggestion.operation,
        title: suggestion.title,
        rationale: suggestion.rationale,
        confidence: suggestion.confidence,
        payload: suggestion.payload,
        existing_value: suggestion.existingValue,
        proposed_value: suggestion.proposedValue,
        status,
        dedupe_key: dedupeKey,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("AI suggestion insert failed:", insertError);
      rejected.push({
        project_id: suggestion.projectId,
        error: "Could not save suggestion.",
      });
      continue;
    }
    created.push(inserted);
  }

  return NextResponse.json({
    ok: rejected.length === 0,
    batch_id: batchId,
    created,
    duplicates,
    rejected,
  });
}

export async function PATCH(request: NextRequest) {
  const checked = await requireUser(request);
  if ("error" in checked) return checked.error;

  let body: Record<string, unknown>;
  try {
    body = asObject(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status =
    typeof body.status === "string" ? body.status.trim() : "";
  const reviewNote =
    body.review_note === null
      ? null
      : typeof body.review_note === "string"
        ? body.review_note.trim().slice(0, 2000)
        : undefined;

  if (!id || !STATUSES.has(status)) {
    return NextResponse.json(
      { error: "A valid suggestion id and status are required." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };
  if (reviewNote !== undefined) patch.review_note = reviewNote;
  if (status === "applied") patch.applied_at = new Date().toISOString();
  if (status !== "applied") patch.applied_at = null;

  const db = createServiceClient();
  const { data, error } = await db
    .from("ai_suggested_updates")
    .update(patch)
    .eq("id", id)
    .eq("user_id", checked.auth.userId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("AI suggestion status update failed:", error);
    return NextResponse.json(
      { error: "Could not update the suggestion." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Suggestion not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ suggestion: data });
}
