import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  cookieOptions,
  createSessionToken,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { findUserById } from "@/lib/auth-users";
import { hasServiceRoleConfig } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      authEnabled: false,
      user: null,
    });
  }

  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  if (!payload) {
    return NextResponse.json({ authEnabled: true, user: null }, { status: 401 });
  }

  // Refresh profile from DB when service role is available
  if (hasServiceRoleConfig()) {
    try {
      const fresh = await findUserById(payload.userId);
      if (!fresh) {
        return NextResponse.json(
          { authEnabled: true, user: null },
          { status: 401 },
        );
      }
      const token = await createSessionToken(fresh);
      const response = NextResponse.json({
        authEnabled: true,
        user: fresh,
      });
      response.cookies.set(AUTH_COOKIE, token, cookieOptions(AUTH_MAX_AGE, request));
      return response;
    } catch (e) {
      console.error("auth/me refresh failed:", e);
    }
  }

  return NextResponse.json({
    authEnabled: true,
    user: sessionUserFromPayload(payload),
  });
}
