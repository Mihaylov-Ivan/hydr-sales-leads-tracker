/** Permission types assignable to users (admin bypasses these). */
export type PermissionType =
  | "sales"
  | "finance"
  | "warehouse"
  | "production"
  | "technical_sales"
  | "eu_funding_rnd"
  | "sales_manager"
  | "viewer";

export const PERMISSION_TYPES: PermissionType[] = [
  "sales",
  "finance",
  "warehouse",
  "production",
  "technical_sales",
  "eu_funding_rnd",
  "sales_manager",
  "viewer",
];

export const PERMISSION_LABELS: Record<PermissionType, string> = {
  sales: "Sales",
  finance: "Finance",
  warehouse: "Warehouse",
  production: "Production",
  technical_sales: "Technical sales",
  eu_funding_rnd: "EU Funding and R&D",
  sales_manager: "Sales Manager",
  viewer: "Viewer",
};

/** Area permissions that grant route access (viewer is not an area). */
const AREA_PERMISSIONS: PermissionType[] = [
  "sales",
  "finance",
  "warehouse",
  "production",
  "technical_sales",
  "eu_funding_rnd",
  "sales_manager",
];

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
  | { kind: "permission"; permission: PermissionType }
  | { kind: "anyOf"; permissions: PermissionType[] }
  /** Authenticated non-viewer (and admin). Used for task-centric pages. */
  | { kind: "nonViewer" };

export function hasPermission(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
  permission: PermissionType,
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.permissions.includes(permission);
}

/** True when the user has viewer and is not an admin. */
export function isViewerUser(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
): boolean {
  if (!user || user.isAdmin) return false;
  return user.permissions.includes("viewer");
}

/** False for viewers (admins always write). */
export function canWrite(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
): boolean {
  if (!user) return false;
  return !isViewerUser(user);
}

export function canAccessRoute(
  user: Pick<SessionUser, "isAdmin" | "permissions"> | null | undefined,
  access: RouteAccess,
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (access.kind === "any") return true;
  if (access.kind === "admin") return false;
  if (access.kind === "nonViewer") return !isViewerUser(user);
  if (access.kind === "permission") {
    return user.permissions.includes(access.permission);
  }
  return access.permissions.some((p) => user.permissions.includes(p));
}

/**
 * Map pathname → required access.
 * `/` and `/projects/*` are sales, technical_sales, or eu_funding_rnd
 * (project page further gates by track).
 * `/todos` is any authenticated non-viewer.
 * Unknown app paths default to admin-only for safety.
 */
export function accessForPath(pathname: string): RouteAccess {
  if (pathname === "/todos" || pathname.startsWith("/todos/")) {
    return { kind: "nonViewer" };
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
  if (pathname === "/prospecting" || pathname.startsWith("/prospecting/")) {
    return { kind: "permission", permission: "sales" };
  }
  if (pathname === "/eu-rnd" || pathname.startsWith("/eu-rnd/")) {
    return { kind: "permission", permission: "eu_funding_rnd" };
  }
  if (pathname.startsWith("/projects/")) {
    return {
      kind: "anyOf",
      permissions: ["sales", "technical_sales", "eu_funding_rnd"],
    };
  }
  if (
    pathname === "/" ||
    pathname === "/metrics" ||
    pathname.startsWith("/metrics/")
  ) {
    return {
      kind: "anyOf",
      permissions: ["sales", "technical_sales"],
    };
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
  return { kind: "admin" };
}

/** Preferred home path for a user given their permissions. */
export function defaultHomePath(
  user: Pick<SessionUser, "isAdmin" | "permissions">,
): string {
  if (
    user.isAdmin ||
    user.permissions.includes("sales") ||
    user.permissions.includes("technical_sales")
  ) {
    return "/";
  }
  if (user.permissions.includes("eu_funding_rnd")) return "/eu-rnd";
  if (user.permissions.includes("finance")) return "/finance";
  if (user.permissions.includes("warehouse")) return "/warehouse";
  if (user.permissions.includes("production")) return "/production";
  // Viewer-only (or no area perms): avoid /todos for viewers
  if (isViewerUser(user)) return "/change-password";
  return "/todos";
}

export interface NavItem {
  href: string;
  label: string;
  access: RouteAccess;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/prospecting", label: "Prospecting", access: { kind: "permission", permission: "sales" } },
  {
    href: "/",
    label: "Sales Projects",
    access: { kind: "anyOf", permissions: ["sales", "technical_sales"] },
  },
  {
    href: "/eu-rnd",
    label: "EU Projects & RnD",
    access: { kind: "permission", permission: "eu_funding_rnd" },
  },
  { href: "/todos", label: "To-Dos", access: { kind: "nonViewer" } },
  { href: "/expenses", label: "Expenses", access: { kind: "permission", permission: "finance" } },
  { href: "/warehouse", label: "Warehouse", access: { kind: "permission", permission: "warehouse" } },
  { href: "/production", label: "Production", access: { kind: "permission", permission: "production" } },
  { href: "/finance", label: "Finance", access: { kind: "permission", permission: "finance" } },
  { href: "/metrics", label: "Metrics", access: { kind: "permission", permission: "sales" } },
  { href: "/admin/history", label: "History", access: { kind: "admin" } },
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

export function hasAreaPermission(
  user: Pick<SessionUser, "permissions"> | null | undefined,
): boolean {
  if (!user) return false;
  return user.permissions.some((p) => AREA_PERMISSIONS.includes(p));
}

/** Members who can be chosen as lead/owner/assignee (excludes Admin and Viewers). */
export function assignableTeamMembers<
  T extends {
    id: string;
    isActive?: boolean;
    username?: string;
    name?: string;
    isAdmin?: boolean;
    isViewer?: boolean;
    permissions?: PermissionType[];
  },
>(members: T[]): T[] {
  return members.filter((m) => {
    if (m.isActive === false) return false;
    if (m.isAdmin) return false;
    if (m.isViewer) return false;
    if (m.permissions?.includes("viewer")) return false;
    const username = m.username?.trim().toLowerCase() ?? "";
    if (username === "admin" || m.id === "u-admin") return false;
    if (m.name?.trim().toLowerCase() === "admin") return false;
    return true;
  });
}
