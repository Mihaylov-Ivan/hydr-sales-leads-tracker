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
  sendDailyProjectUpdatesEmail,
  sofiaDateString,
  type DailyBriefingRow,
} from "@/lib/briefing-email";

export const runtime = "nodejs";

function bearer(request: NextRequest): string {
  const value = request.headers.get("authorization")?.trim() ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function authorized(request: NextRequest): Promise<boolean> {
  const cronSecret = (
    process.env.BRIEFING_EMAIL_CRON_SECRET?.trim() ||
    process.env.AI_SUMMARY_CRON_SECRET?.trim() ||
    ""
  );
  if (cronSecret && bearer(request) === cronSecret) return true;

  if (!isAuthEnabled()) return true;
  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  return Boolean(payload?.isAdmin);
}

/**
 * Cron/admin endpoint: load today's (Sofia) Daily briefing from the DB
 * (written by the external ChatGPT scheduled task) and email only the
 * ## Project updates section via Resend.
 */
export async function POST(request: NextRequest) {
  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      { error: "Database service role is not configured." },
      { status: 503 },
    );
  }
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    /* empty body is fine */
  }

  const today = sofiaDateString();
  const db = createServiceClient();

  const { data: todayRow, error: todayError } = await db
    .from("crm_briefings")
    .select(
      "id, briefing_type, period_start, period_end, title, summary, generated_at",
    )
    .eq("briefing_type", "daily")
    .eq("period_end", today)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (todayError) {
    console.error("load daily briefing failed:", todayError);
    return NextResponse.json(
      { error: "Could not load daily briefing." },
      { status: 500 },
    );
  }

  let briefing = (todayRow as DailyBriefingRow | null) ?? null;

  if (!briefing && force) {
    const { data: latest, error: latestError } = await db
      .from("crm_briefings")
      .select(
        "id, briefing_type, period_start, period_end, title, summary, generated_at",
      )
      .eq("briefing_type", "daily")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.error("load latest daily briefing failed:", latestError);
      return NextResponse.json(
        { error: "Could not load daily briefing." },
        { status: 500 },
      );
    }
    briefing = (latest as DailyBriefingRow | null) ?? null;
  }

  if (!briefing) {
    return NextResponse.json(
      {
        error: `No daily briefing found for ${today} (Europe/Sofia). Wait for the ChatGPT scheduled write, or pass {"force":true} to use the latest daily.`,
      },
      { status: 404 },
    );
  }

  const result = await sendDailyProjectUpdatesEmail(briefing);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    emailId: result.emailId,
    briefingId: result.briefingId,
    periodEnd: result.periodEnd,
    to:
      process.env.BRIEFING_EMAIL_TO?.trim() || "i.mihaylov@hydrogenera.eu",
  });
}
