"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SessionUser } from "@/lib/permissions";
import { hasPermission, type PermissionType } from "@/lib/permissions";

interface AuthContextValue {
  ready: boolean;
  authEnabled: boolean;
  user: SessionUser | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: PermissionType) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = (await res.json().catch(() => null)) as {
        authEnabled?: boolean;
        user?: SessionUser | null;
      } | null;
      setAuthEnabled(data?.authEnabled !== false);
      if (res.ok && data?.user) {
        setUser(data.user);
      } else if (res.status === 401) {
        setUser(null);
      } else if (data?.authEnabled === false) {
        setUser(null);
      } else {
        setUser(data?.user ?? null);
      }
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      authEnabled,
      user,
      refresh,
      logout,
      can: (permission) => hasPermission(user, permission),
    }),
    [ready, authEnabled, user, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
