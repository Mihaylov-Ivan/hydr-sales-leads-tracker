import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  cookieOptions,
  createSessionToken,
  isAuthEnabled,
  parseSessionToken,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-passwords";
import {
  findUserById,
  findUserByUsername,
  setUserPasswordHash,
} from "@/lib/auth-users";
import { hasServiceRoleConfig } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!isAuthEnabled() || !hasServiceRoleConfig()) {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  if (!payload) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const found = await findUserByUsername(payload.username);
    if (!found || found.user.userId !== payload.userId) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (!verifyPassword(currentPassword, found.passwordHash)) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 },
      );
    }

    await setUserPasswordHash(payload.userId, hashPassword(newPassword), false);
    const fresh = await findUserById(payload.userId);
    if (!fresh) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const token = await createSessionToken(fresh);
    const response = NextResponse.json({ ok: true, user: fresh });
    response.cookies.set(AUTH_COOKIE, token, cookieOptions(AUTH_MAX_AGE, request));
    return response;
  } catch (e) {
    console.error("change-password failed:", e);
    return NextResponse.json(
      { error: "Could not change password." },
      { status: 500 },
    );
  }
}
