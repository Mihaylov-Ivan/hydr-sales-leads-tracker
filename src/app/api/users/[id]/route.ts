import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { hashPassword } from "@/lib/auth-passwords";
import { updateManagedUser } from "@/lib/auth-users";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  // Prevent admin from deactivating themselves
  let body: {
    name?: string;
    email?: string | null;
    username?: string;
    isAdmin?: boolean;
    isActive?: boolean;
    password?: string;
    permissions?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (id === auth.user.userId && body.isActive === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }
  if (id === auth.user.userId && body.isAdmin === false) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access." },
      { status: 400 },
    );
  }

  const permissions: PermissionType[] | undefined = body.permissions
    ? body.permissions.filter(isPermissionType)
    : undefined;

  if (body.password !== undefined && body.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const user = await updateManagedUser(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.username !== undefined ? { username: body.username } : {}),
      ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
      ...(body.password
        ? {
            passwordHash: hashPassword(body.password),
            mustChangePassword: true,
          }
        : {}),
    });
    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update user.";
    const status = /duplicate|unique/i.test(message)
      ? 409
      : /not found/i.test(message)
        ? 404
        : 500;
    console.error("update user failed:", e);
    return NextResponse.json(
      {
        error:
          status === 409
            ? "Username already exists."
            : status === 404
              ? "User not found."
              : "Could not update user.",
      },
      { status },
    );
  }
}
