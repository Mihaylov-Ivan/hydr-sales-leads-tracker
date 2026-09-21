import type { SessionUser } from "@/lib/permissions";
import { canWrite } from "@/lib/permissions";

export const VIEWER_WRITE_BLOCKED = {
  ok: false as const,
  error: "Viewers cannot make changes.",
};

/** When auth is disabled (local/dev), treat as writable. */
export function mutationAllowed(
  authEnabled: boolean,
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
): boolean {
  if (!authEnabled) return true;
  return canWrite(user);
}

/**
 * Wrap selected API methods so viewers cannot mutate.
 * Blocked calls return {@link VIEWER_WRITE_BLOCKED} (safe for `{ ok }` results;
 * void/string callers are UI-gated and should not invoke these).
 */
export function guardWriteMethods<T extends object>(
  api: T,
  allowed: () => boolean,
  writeKeys: readonly (keyof T & string)[],
): T {
  const keySet = new Set<string>(writeKeys);
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof prop === "string" &&
        keySet.has(prop) &&
        typeof value === "function"
      ) {
        return (...args: unknown[]) => {
          if (!allowed()) return VIEWER_WRITE_BLOCKED;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
}
