import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { hashPassword } from "@/lib/auth-passwords";
import {
  createManagedUser,
  listManagedUsers,
} from "@/lib/auth-users";
import {
  PermissionType,
  isPermissionType,
} from "@/lib/permissions";
import { hasServiceRoleConfig } from "@/lib/supabase-server";

async function requireAdmin(request: NextRequest) {
  if (!isAuthEnabled() || !hasServiceRoleConfig()) {
    return {
      error: NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 503 },
      ),
    };
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
  if (!user.isAdmin) {
    return {
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const users = await listManagedUsers();
    return NextResponse.json({ users });
  } catch (e) {
    console.error("list users failed:", e);
    return NextResponse.json(
      { error: "Could not load users." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: {
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    isAdmin?: boolean;
    permissions?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!name || !username) {
    return NextResponse.json(
      { error: "Name and username are required." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const permissions: PermissionType[] = [];
  for (const p of body.permissions ?? []) {
    if (isPermissionType(p) && !permissions.includes(p)) permissions.push(p);
  }

  try {
    const user = await createManagedUser({
      name,
      username,
      email: body.email,
      passwordHash: hashPassword(password),
      isAdmin: Boolean(body.isAdmin),
      permissions,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create user.";
    const status = /duplicate|unique/i.test(message) ? 409 : 500;
    console.error("create user failed:", e);
    return NextResponse.json(
      {
        error:
          status === 409
            ? "Username already exists."
            : "Could not create user.",
      },
      { status },
    );
  }
}
