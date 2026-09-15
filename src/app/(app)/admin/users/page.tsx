"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  PERMISSION_LABELS,
  PERMISSION_TYPES,
  type PermissionType,
} from "@/lib/permissions";
import { useProjects } from "@/lib/store";

interface ManagedUser {
  id: string;
  name: string;
  email?: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  permissions: PermissionType[];
  hasPassword: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent";

function PermissionChecks({
  value,
  onChange,
  disabled,
}: {
  value: PermissionType[];
  onChange: (next: PermissionType[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {PERMISSION_TYPES.map((p) => {
        const checked = value.includes(p);
        return (
          <label
            key={p}
            className="flex items-center gap-1.5 text-sm text-deep"
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={checked}
              onChange={() => {
                if (checked) onChange(value.filter((x) => x !== p));
                else onChange([...value, p]);
              }}
            />
            {PERMISSION_LABELS[p]}
          </label>
        );
      })}
    </div>
  );
}

function UserRow({
  user,
  onSaved,
}: {
  user: ManagedUser;
  onSaved: (user: ManagedUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? "");
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [isActive, setIsActive] = useState(user.isActive);
  const [permissions, setPermissions] = useState<PermissionType[]>(
    user.permissions,
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email ?? "");
    setIsAdmin(user.isAdmin);
    setIsActive(user.isActive);
    setPermissions(user.permissions);
  }, [user]);

  async function save() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          username,
          email: email.trim() || null,
          isAdmin,
          isActive,
          permissions: isAdmin ? [] : permissions,
          ...(password.trim() ? { password: password.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        user?: ManagedUser;
      } | null;
      if (!res.ok || !data?.user) {
        setError(data?.error ?? "Could not save user.");
        return;
      }
      setPassword("");
      setMsg(password.trim() ? "Saved (password reset)." : "Saved.");
      onSaved(data.user);
    } catch {
      setError("Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Display name
          </span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Username
          </span>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Email
          </span>
          <input
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Reset password (optional)
          </span>
          <input
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm text-deep">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin (all access)
        </label>
        <label className="flex items-center gap-1.5 text-sm text-deep">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
        {!user.hasPassword && (
          <span className="text-xs font-semibold text-amber-700">
            No password set yet
          </span>
        )}
        {!user.username && (
          <span className="text-xs font-semibold text-amber-700">
            Set a username to enable login
          </span>
        )}
        {user.mustChangePassword && (
          <span className="text-xs text-muted">Must change password</span>
        )}
      </div>

      {!isAdmin && (
        <div className="mt-3">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Permission types
          </span>
          <PermissionChecks value={permissions} onChange={setPermissions} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || !name.trim() || !username.trim()}
          onClick={() => void save()}
          className="rounded-lg bg-olive px-4 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {msg && !error && <span className="text-sm text-teal-accent">{msg}</span>}
      </div>
    </li>
  );
}

export default function AdminUsersPage() {
  const { reloadTeamMembers } = useProjects();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionType[]>(["sales"]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        users?: ManagedUser[];
      } | null;
      if (!res.ok) {
        setLoadError(data?.error ?? "Could not load users.");
        setUsers([]);
        return;
      }
      setUsers(data?.users ?? []);
    } catch {
      setLoadError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          username,
          email: email.trim() || undefined,
          password,
          isAdmin,
          permissions: isAdmin ? [] : permissions,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        user?: ManagedUser;
      } | null;
      if (!res.ok || !data?.user) {
        setCreateError(data?.error ?? "Could not create user.");
        return;
      }
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setIsAdmin(false);
      setPermissions(["sales"]);
      setUsers((prev) =>
        [...prev, data.user!].sort((a, b) => a.name.localeCompare(b.name)),
      );
      void reloadTeamMembers();
    } catch {
      setCreateError("Could not create user.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-deep">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Create accounts, assign permission types, and reset passwords. Admin
          users have access to every feature and all data.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          New user
        </h2>
        <form onSubmit={onCreate} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Display name
            </span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Username
            </span>
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Email (optional)
            </span>
            <input
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Temporary password
            </span>
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-deep">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              Admin
            </label>
          </div>
          {!isAdmin && (
            <div className="md:col-span-2">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                Permission types
              </span>
              <PermissionChecks
                value={permissions}
                onChange={setPermissions}
              />
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-olive px-4 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create user"}
            </button>
            {createError && (
              <span className="text-sm text-red-600">{createError}</span>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-deep">
          Existing users
        </h2>
        {loading && (
          <p className="text-sm text-muted">Loading users…</p>
        )}
        {loadError && (
          <p className="text-sm text-red-600">{loadError}</p>
        )}
        {!loading && !loadError && users.length === 0 && (
          <p className="text-sm text-muted">No users found.</p>
        )}
        <ul className="flex flex-col gap-3">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onSaved={(next) => {
                setUsers((prev) =>
                  prev
                    .map((x) => (x.id === next.id ? next : x))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                );
                void reloadTeamMembers();
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
