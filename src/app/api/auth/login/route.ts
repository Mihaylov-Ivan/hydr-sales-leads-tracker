import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  expectedAuthToken,
  getSitePassword,
  passwordsMatch,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const password = getSitePassword();
  if (!password) {
    return NextResponse.json(
      { error: "Password protection is not configured." },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const submitted = body.password ?? "";
  if (!(await passwordsMatch(submitted, password))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await expectedAuthToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return response;
}
