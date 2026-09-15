import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import {
  accessForPath,
  canAccessRoute,
  defaultHomePath,
} from "@/lib/permissions";

export async function middleware(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/hydrogenera-logo.png";

  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  const user = payload ? sessionUserFromPayload(payload) : null;

  if (isPublic) {
    if (pathname === "/login" && user) {
      if (user.mustChangePassword) {
        return NextResponse.redirect(new URL("/change-password", request.url));
      }
      return NextResponse.redirect(new URL(defaultHomePath(user), request.url));
    }
    return NextResponse.next();
  }

  if (!user) {
    // Allow unauthenticated access only to login; APIs get 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    const next = pathname + request.nextUrl.search;
    if (next && next !== "/") {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (
    user.mustChangePassword &&
    pathname !== "/change-password" &&
    !pathname.startsWith("/api/auth/change-password") &&
    !pathname.startsWith("/api/auth/me") &&
    !pathname.startsWith("/api/auth/logout")
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Password change required." },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // API routes (except auth) rely on their own admin checks; still require login above
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const access = accessForPath(pathname);
  if (!canAccessRoute(user, access)) {
    return NextResponse.redirect(new URL(defaultHomePath(user), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
