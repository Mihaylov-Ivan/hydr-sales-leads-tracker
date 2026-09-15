import {
  PermissionType,
  SessionUser,
  isPermissionType,
} from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase-server";

export interface AuthUserRow {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  is_admin: boolean;
  is_active: boolean;
  must_change_password: boolean;
}

export interface ManagedUser {
  id: string;
  name: string;
  email?: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  permissions: PermissionType[];
  hasPassword: boolean;
  createdAt?: string;
}

function toSessionUser(
  row: AuthUserRow,
  permissions: PermissionType[],
): SessionUser | null {
  const username = row.username?.trim();
  if (!username) return null;
  return {
    userId: row.id,
    username,
    name: row.name,
    isAdmin: Boolean(row.is_admin),
    permissions,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

async function loadPermissions(
  userId: string,
): Promise<PermissionType[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("user_permission_types")
    .select("permission_type")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const out: PermissionType[] = [];
  for (const row of data ?? []) {
    const t = (row as { permission_type: string }).permission_type;
    if (isPermissionType(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export async function findUserByUsername(
  username: string,
): Promise<{ user: SessionUser; passwordHash: string } | null> {
  const db = createServiceClient();
  const normalized = username.trim().toLowerCase();
  const { data, error } = await db
    .from("team_members")
    .select(
      "id, name, email, username, password_hash, is_admin, is_active, must_change_password",
    )
    .ilike("username", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as AuthUserRow;
  if (!row.is_active) return null;
  if (!row.password_hash) return null;
  const permissions = row.is_admin ? [] : await loadPermissions(row.id);
  const user = toSessionUser(row, permissions);
  if (!user) return null;
  return { user, passwordHash: row.password_hash };
}

export async function findUserById(userId: string): Promise<SessionUser | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("team_members")
    .select(
      "id, name, email, username, password_hash, is_admin, is_active, must_change_password",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as AuthUserRow;
  if (!row.is_active) return null;
  const permissions = row.is_admin ? [] : await loadPermissions(row.id);
  return toSessionUser(row, permissions);
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const db = createServiceClient();
  const [membersRes, permsRes] = await Promise.all([
    db
      .from("team_members")
      .select(
        "id, name, email, username, password_hash, is_admin, is_active, must_change_password, created_at",
      )
      .order("name", { ascending: true }),
    db.from("user_permission_types").select("user_id, permission_type"),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (permsRes.error) throw new Error(permsRes.error.message);

  const permsByUser = new Map<string, PermissionType[]>();
  for (const row of permsRes.data ?? []) {
    const r = row as { user_id: string; permission_type: string };
    if (!isPermissionType(r.permission_type)) continue;
    const list = permsByUser.get(r.user_id) ?? [];
    if (!list.includes(r.permission_type)) list.push(r.permission_type);
    permsByUser.set(r.user_id, list);
  }

  return (membersRes.data ?? [])
    .map((raw) => {
      const row = raw as AuthUserRow & { created_at?: string };
      const username = row.username?.trim() ?? "";
      return {
        id: row.id,
        name: row.name,
        ...(row.email ? { email: row.email } : {}),
        username,
        isAdmin: Boolean(row.is_admin),
        isActive: row.is_active !== false,
        mustChangePassword: Boolean(row.must_change_password),
        permissions: permsByUser.get(row.id) ?? [],
        hasPassword: Boolean(row.password_hash),
        ...(row.created_at ? { createdAt: row.created_at } : {}),
      } satisfies ManagedUser;
    })
    .filter((u) => Boolean(u.name));
}

export async function replaceUserPermissions(
  userId: string,
  permissions: PermissionType[],
): Promise<void> {
  const db = createServiceClient();
  const unique = [...new Set(permissions.filter(isPermissionType))];
  const { error: delErr } = await db
    .from("user_permission_types")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  if (unique.length === 0) return;
  const { error: insErr } = await db.from("user_permission_types").insert(
    unique.map((permission_type) => ({ user_id: userId, permission_type })),
  );
  if (insErr) throw new Error(insErr.message);
}

export async function createManagedUser(input: {
  name: string;
  username: string;
  email?: string;
  passwordHash: string;
  isAdmin: boolean;
  permissions: PermissionType[];
}): Promise<ManagedUser> {
  const db = createServiceClient();
  const id = `u-${crypto.randomUUID()}`;
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  const email = input.email?.trim() || null;

  const { error } = await db.from("team_members").insert({
    id,
    name,
    email,
    username,
    password_hash: input.passwordHash,
    is_admin: input.isAdmin,
    is_active: true,
    must_change_password: true,
  });
  if (error) throw new Error(error.message);

  if (!input.isAdmin) {
    await replaceUserPermissions(id, input.permissions);
  }

  return {
    id,
    name,
    ...(email ? { email } : {}),
    username,
    isAdmin: input.isAdmin,
    isActive: true,
    mustChangePassword: true,
    permissions: input.isAdmin ? [] : input.permissions,
    hasPassword: true,
  };
}

export async function updateManagedUser(
  userId: string,
  patch: {
    name?: string;
    email?: string | null;
    username?: string;
    isAdmin?: boolean;
    isActive?: boolean;
    mustChangePassword?: boolean;
    passwordHash?: string;
    permissions?: PermissionType[];
  },
): Promise<ManagedUser> {
  const db = createServiceClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.email !== undefined) {
    row.email = patch.email === null || !patch.email.trim() ? null : patch.email.trim();
  }
  if (patch.username !== undefined) {
    row.username = patch.username.trim().toLowerCase();
  }
  if (patch.isAdmin !== undefined) row.is_admin = patch.isAdmin;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.mustChangePassword !== undefined) {
    row.must_change_password = patch.mustChangePassword;
  }
  if (patch.passwordHash !== undefined) row.password_hash = patch.passwordHash;

  const { error } = await db.from("team_members").update(row).eq("id", userId);
  if (error) throw new Error(error.message);

  if (patch.permissions !== undefined || patch.isAdmin === true) {
    const perms =
      patch.isAdmin === true ? [] : (patch.permissions ?? undefined);
    if (perms !== undefined) {
      await replaceUserPermissions(userId, perms);
    }
  }

  const users = await listManagedUsers();
  const updated = users.find((u) => u.id === userId);
  if (!updated) throw new Error("User not found after update.");
  return updated;
}

export async function setUserPasswordHash(
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("team_members")
    .update({
      password_hash: passwordHash,
      must_change_password: mustChangePassword,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
