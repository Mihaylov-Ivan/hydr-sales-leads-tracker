import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
} from "@/lib/auth";
import { syncFirefliesMeetings } from "@/lib/fireflies";
import {
  createServiceClient,
  hasServiceRoleConfig,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

type AdminIdentity = { userId: string | null; isAdmin: true };

async function requireAdmin(
  request: NextRequest,
): Promise<{ admin?: AdminIdentity; error?: NextResponse }> {
  if (!hasServiceRoleConfig()) {
    return {
      error: NextResponse.json(
        { error: "Database is not configured." },
        { status: 503 },
      ),
    };
  }

  if (!isAuthEnabled()) {
    return { admin: { userId: null, isAdmin: true } };
  }

  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  if (!payload) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  if (!payload.isAdmin) {
    return {
      error: NextResponse.json(
        {
          error:
            "Meeting transcript review is admin-only until per-meeting access controls are configured.",
        },
        { status: 403 },
      ),
    };
  }
  return { admin: { userId: payload.userId, isAdmin: true } };
}

function validPollSecret(request: NextRequest): boolean {
  const expected = process.env.FIREFLIES_POLL_SECRET?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("x-hydr-fireflies-secret")?.trim();
  return supplied === expected;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const id = request.nextUrl.searchParams.get("id")?.trim();
  const status = request.nextUrl.searchParams.get("status")?.trim() || "actionable";
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const db = createServiceClient();

    if (id) {
      const { data, error } = await db
        .from("fireflies_meeting_inbox")
        .select("*")
        .eq("fireflies_transcript_id", id)
        .maybeSingle();
      if (error) {
        console.error("fireflies inbox meeting read failed:", error);
        return NextResponse.json(
          { error: "Could not load meeting transcript." },
          { status: 500 },
        );
      }
      if (!data) {
        return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
      }
      return NextResponse.json({ meeting: data });
    }

    const actionable = ["pending", "reviewing", "needs-clarification"];
    let query = db
      .from("fireflies_meeting_inbox")
      .select(
        "fireflies_transcript_id,title,meeting_date,host_email,organizer_email,participants,transcript_url,status,linked_project_ids,review_summary,clarification_questions,clarification_answers,imported_at,updated_at",
      )
      .order("meeting_date", { ascending: true })
      .order("imported_at", { ascending: true })
      .limit(limit);

    if (status === "actionable") {
      query = query.in("status", actionable);
    } else if (
      ["pending", "reviewing", "needs-clarification", "processed", "ignored", "error"].includes(
        status,
      )
    ) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("fireflies inbox list failed:", error);
      return NextResponse.json(
        { error: "Could not load meeting inbox." },
        { status: 500 },
      );
    }

    const { count, error: countError } = await db
      .from("fireflies_meeting_inbox")
      .select("fireflies_transcript_id", { count: "exact", head: true })
      .in("status", actionable);

    if (countError) {
      console.error("fireflies inbox count failed:", countError);
    }

    return NextResponse.json({
      meetings: data ?? [],
      actionable_count: count ?? (data ?? []).length,
    });
  } catch (error) {
    console.error("fireflies inbox GET failed:", error);
    return NextResponse.json(
      { error: "Could not load meeting inbox." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let admin: AdminIdentity | undefined;
  if (!validPollSecret(request)) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    admin = auth.admin;
  }

  try {
    const result = await syncFirefliesMeetings();
    return NextResponse.json({ ok: true, ...result, requested_by: admin?.userId ?? "poller" });
  } catch (error) {
    console.error("Fireflies sync failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not sync Fireflies meetings.",
      },
      { status: 502 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const meetingId =
    typeof body.meeting_id === "string" ? body.meeting_id.trim() : "";
  if (!meetingId) {
    return NextResponse.json({ error: "meeting_id is required." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.status === "string") {
    const allowed = [
      "pending",
      "reviewing",
      "needs-clarification",
      "processed",
      "ignored",
      "error",
    ];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "Invalid meeting status." }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "processed") {
      patch.processed_at = new Date().toISOString();
      patch.processed_by = auth.admin?.userId ?? null;
    } else if (body.status !== "ignored") {
      patch.processed_at = null;
      patch.processed_by = null;
    }
  }

  if (body.review_summary === null || typeof body.review_summary === "string") {
    patch.review_summary =
      body.review_summary === null ? null : body.review_summary.trim().slice(0, 20000);
  }

  if (Array.isArray(body.linked_project_ids)) {
    patch.linked_project_ids = body.linked_project_ids
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (Array.isArray(body.clarification_questions)) {
    patch.clarification_questions = body.clarification_questions
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  if (Array.isArray(body.clarification_answers)) {
    patch.clarification_answers = body.clarification_answers
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  try {
    const db = createServiceClient();

    if (body.status === "processed") {
      const { data: current, error: currentError } = await db
        .from("fireflies_meeting_inbox")
        .select("clarification_questions,clarification_answers")
        .eq("fireflies_transcript_id", meetingId)
        .maybeSingle();

      if (currentError) {
        console.error("fireflies inbox completion check failed:", currentError);
        return NextResponse.json(
          { error: "Could not verify meeting clarification state." },
          { status: 500 },
        );
      }
      if (!current) {
        return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
      }

      const nextQuestions = Array.isArray(patch.clarification_questions)
        ? patch.clarification_questions
        : Array.isArray(current.clarification_questions)
          ? current.clarification_questions
          : [];
      const nextAnswers = Array.isArray(patch.clarification_answers)
        ? patch.clarification_answers
        : Array.isArray(current.clarification_answers)
          ? current.clarification_answers
          : [];

      if (nextQuestions.length > nextAnswers.length) {
        return NextResponse.json(
          {
            error:
              "This meeting still has unanswered clarification questions and cannot be marked processed.",
          },
          { status: 409 },
        );
      }
    }

    const { data, error } = await db
      .from("fireflies_meeting_inbox")
      .update(patch)
      .eq("fireflies_transcript_id", meetingId)
      .select(
        "fireflies_transcript_id,title,meeting_date,status,linked_project_ids,review_summary,clarification_questions,clarification_answers,processed_at,updated_at",
      )
      .maybeSingle();

    if (error) {
      console.error("fireflies inbox PATCH failed:", error);
      return NextResponse.json(
        { error: "Could not update meeting review state." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, meeting: data });
  } catch (error) {
    console.error("fireflies inbox PATCH failed:", error);
    return NextResponse.json(
      { error: "Could not update meeting review state." },
      { status: 500 },
    );
  }
}
