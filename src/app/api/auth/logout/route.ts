import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  LEGACY_AUTH_COOKIE,
  cookieOptions,
} from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", cookieOptions(0));
  response.cookies.set(LEGACY_AUTH_COOKIE, "", cookieOptions(0));
  return response;
}
