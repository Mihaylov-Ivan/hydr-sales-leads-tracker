/** Permission types assignable to users (admin bypasses these). */
export type PermissionType = "sales" | "finance" | "warehouse" | "production";

export const PERMISSION_TYPES: PermissionType[] = [
  "sales",
  "finance",
  "warehouse",
  "production",
];

export const PERMISSION_LABELS: Record<PermissionType, string> = {
  sales: "Sales",
  finance: "Finance",
  warehouse: "Warehouse",
  production: "Production",
};

export interface SessionUser {
  userId: string;
  username: string;
  name: string;
  isAdmin: boolean;
  permissions: PermissionType[];
  mustChangePassword: boolean;
}

/** Nav / route permission requirements. */
export type RouteAccess =
  | { kind: "any" }
  | { kind: "admin" }
  | { kind: "permission"; permission: PermissionType };

export function hasPermission(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
  permission: PermissionType,
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.permissions.includes(permission);
}

export function canAccessRoute(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
  access: RouteAccess,
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (access.kind === "any") return true;
  if (access.kind === "admin") return false;
  return user.permissions.includes(access.permission);
}

/**
 * Map pathname → required access.
 * `/` and `/projects/*` are sales. `/todos` is any authenticated user.
 * Unknown app paths default to admin-only for safety.
 */
export function accessForPath(pathname: string): RouteAccess {
  if (pathname === "/todos" || pathname.startsWith("/todos/")) {
    return { kind: "any" };
  }
  if (pathname === "/change-password" || pathname.startsWith("/change-password/")) {
    return { kind: "any" };
  }
  if (
    pathname === "/admin/users" ||
    pathname.startsWith("/admin/users/") ||
    pathname.startsWith("/admin/")
  ) {
    return { kind: "admin" };
  }
  if (
    pathname === "/prospecting" ||
    pathname.startsWith("/prospecting/") ||
    pathname === "/" ||
    pathname.startsWith("/projects/") ||
    pathname === "/metrics" ||
    pathname.startsWith("/metrics/")
  ) {
    return { kind: "permission", permission: "sales" };
  }
  if (
    pathname === "/expenses" ||
    pathname.startsWith("/expenses/") ||
    pathname === "/finance" ||
    pathname.startsWith("/finance/")
  ) {
    return { kind: "permission", permission: "finance" };
  }
  if (pathname === "/warehouse" || pathname.startsWith("/warehouse/")) {
    return { kind: "permission", permission: "warehouse" };
  }
  if (pathname === "/production" || pathname.startsWith("/production/")) {
    return { kind: "permission", permission: "production" };
  }
  // API routes are handled separately; treat other pages as admin.
  return { kind: "admin" };
}

/** Preferred home path for a user given their permissions. */
export function defaultHomePath(
  user: Pick<SessionUser, "isAdmin" | "permissions">,
): string {
  if (user.isAdmin || user.permissions.includes("sales")) return "/";
  if (user.permissions.includes("finance")) return "/finance";
  if (user.permissions.includes("warehouse")) return "/warehouse";
  if (user.permissions.includes("production")) return "/production";
  return "/todos";
}

export interface NavItem {
  href: string;
  label: string;
  access: RouteAccess;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/prospecting", label: "Prospecting", access: { kind: "permission", permission: "sales" } },
  { href: "/", label: "Sales Projects", access: { kind: "permission", permission: "sales" } },
  { href: "/todos", label: "To-Dos", access: { kind: "any" } },
  { href: "/expenses", label: "Expenses", access: { kind: "permission", permission: "finance" } },
  { href: "/warehouse", label: "Warehouse", access: { kind: "permission", permission: "warehouse" } },
  { href: "/production", label: "Production", access: { kind: "permission", permission: "production" } },
  { href: "/finance", label: "Finance", access: { kind: "permission", permission: "finance" } },
  { href: "/metrics", label: "Metrics", access: { kind: "permission", permission: "sales" } },
  { href: "/admin/users", label: "Users", access: { kind: "admin" } },
];

export function visibleNavItems(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
): NavItem[] {
  if (!user) return [];
  return NAV_ITEMS.filter((item) => canAccessRoute(user, item.access));
}

export function isPermissionType(value: string): value is PermissionType {
  return (PERMISSION_TYPES as string[]).includes(value);
}
