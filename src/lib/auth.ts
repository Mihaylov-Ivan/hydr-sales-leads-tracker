/**
 * Session cookie auth (Edge + Node compatible).
 * Password hashing lives in auth-passwords.ts (Node-only).
 */

import type { PermissionType, SessionUser } from "./permissions";
import { isPermissionType } from "./permissions";

export const AUTH_COOKIE = "hydr_session";

/** Legacy shared-password cookie — cleared on logout/login. */
export const LEGACY_AUTH_COOKIE = "hydr_site_auth";

/** 30 days */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionPayload {
  userId: string;
  username: string;
  name: string;
  isAdmin: boolean;
  permissions: PermissionType[];
  mustChangePassword: boolean;
  exp: number;
}

export function getSessionSecret(): string | undefined {
  const value = process.env.SESSION_SECRET?.trim();
  return value || undefined;
}

/** Auth is enforced when SESSION_SECRET is set. */
export function isAuthEnabled(): boolean {
  return Boolean(getSessionSecret());
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(signature);
}

async function hmacVerify(
  secret: string,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  const expected = await hmacSign(secret, message);
  if (expected.length !== signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
}

function normalizePermissions(raw: unknown): PermissionType[] {
  if (!Array.isArray(raw)) return [];
  const out: PermissionType[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isPermissionType(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function sessionUserFromPayload(payload: SessionPayload): SessionUser {
  return {
    userId: payload.userId,
    username: payload.username,
    name: payload.name,
    isAdmin: payload.isAdmin,
    permissions: payload.permissions,
    mustChangePassword: payload.mustChangePassword,
  };
}

export async function createSessionToken(
  user: SessionUser,
  maxAgeSeconds: number = AUTH_MAX_AGE,
): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const payload: SessionPayload = {
    userId: user.userId,
    username: user.username,
    name: user.name,
    isAdmin: user.isAdmin,
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function parseSessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  if (!(await hmacVerify(secret, body, sig))) return null;

  try {
    const raw = JSON.parse(base64UrlDecode(body)) as Partial<SessionPayload>;
    if (
      typeof raw.userId !== "string" ||
      typeof raw.username !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.isAdmin !== "boolean" ||
      typeof raw.exp !== "number"
    ) {
      return null;
    }
    if (raw.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: raw.userId,
      username: raw.username,
      name: raw.name,
      isAdmin: raw.isAdmin,
      permissions: normalizePermissions(raw.permissions),
      mustChangePassword: Boolean(raw.mustChangePassword),
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}

type CookieRequest = {
  nextUrl: { protocol: string };
  headers: { get(name: string): string | null };
};

/** Secure cookies are ignored on http://192.168.x.x; localhost is special-cased. */
export function cookieSecureFromRequest(request: CookieRequest): boolean {
  const forwarded = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  return request.nextUrl.protocol === "https:";
}

export function cookieOptions(maxAge: number, request: CookieRequest) {
  return {
    httpOnly: true,
    secure: cookieSecureFromRequest(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
