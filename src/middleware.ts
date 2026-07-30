import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthEnabled, isValidAuthToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Public: login UI + auth API + static assets
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/hydrogenera-logo.png"
  ) {
    if (
      pathname === "/login" &&
      (await isValidAuthToken(request.cookies.get(AUTH_COOKIE)?.value))
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!(await isValidAuthToken(request.cookies.get(AUTH_COOKIE)?.value))) {
    const loginUrl = new URL("/login", request.url);
    const next = pathname + request.nextUrl.search;
    if (next && next !== "/") {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
