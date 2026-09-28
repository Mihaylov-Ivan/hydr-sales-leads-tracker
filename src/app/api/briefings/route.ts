import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  createServiceClient,
  hasServiceRoleConfig,
} from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireBriefingsAccess(request: NextRequest) {
  if (!hasServiceRoleConfig()) {
    return {
      error: NextResponse.json(
        { error: "Database service role is not configured." },
        { status: 503 },
      ),
    };
  }

  if (!isAuthEnabled()) {
    return { userId: "local-admin" };
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
  if (!hasPermission(user, "briefings")) {
    return {
      error: NextResponse.json(
        { error: "Briefings permission is required." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.userId };
}

export async function GET(request: NextRequest) {
  const checked = await requireBriefingsAccess(request);
  if ("error" in checked) return checked.error;

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "180");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 3), 365)
    : 180;

  const db = createServiceClient();
  const { data, error } = await db
    .from("crm_briefings")
    .select(
      "id, briefing_type, period_start, period_end, title, summary, highlights, metrics, generated_at, generated_by, source_from, source_to, created_at, updated_at",
    )
    .order("period_start", { ascending: false })
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("load CRM briefings failed:", error);
    return NextResponse.json(
      { error: "Could not load CRM briefings." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { briefings: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
