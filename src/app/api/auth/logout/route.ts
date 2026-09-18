import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  LEGACY_AUTH_COOKIE,
  cookieOptions,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", cookieOptions(0, request));
  response.cookies.set(LEGACY_AUTH_COOKIE, "", cookieOptions(0, request));
  return response;
}
