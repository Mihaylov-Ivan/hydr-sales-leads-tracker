import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  LEGACY_AUTH_COOKIE,
  cookieOptions,
  createSessionToken,
  isAuthEnabled,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-passwords";
import { findUserByUsername } from "@/lib/auth-users";
import { defaultHomePath } from "@/lib/permissions";
import { hasServiceRoleConfig } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json(
      { error: "Authentication is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }
  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for login." },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  try {
    const found = await findUserByUsername(username);
    if (!found || !verifyPassword(password, found.passwordHash)) {
      return NextResponse.json(
        { error: "Incorrect username or password." },
        { status: 401 },
      );
    }

    const token = await createSessionToken(found.user);
    const response = NextResponse.json({
      ok: true,
      user: found.user,
      home: defaultHomePath(found.user),
    });
    response.cookies.set(AUTH_COOKIE, token, cookieOptions(AUTH_MAX_AGE, request));
    response.cookies.set(LEGACY_AUTH_COOKIE, "", cookieOptions(0, request));
    return response;
  } catch (e) {
    console.error("Login failed:", e);
    return NextResponse.json(
      { error: "Could not sign in. Try again." },
      { status: 500 },
    );
  }
}
