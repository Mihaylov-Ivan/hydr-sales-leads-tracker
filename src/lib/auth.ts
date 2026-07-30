export const AUTH_COOKIE = "hydr_site_auth";

/** 30 days */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30;

const AUTH_MESSAGE = "hydr-sales-access-v1";

export function getSitePassword(): string | undefined {
  const value = process.env.SITE_PASSWORD?.trim();
  return value || undefined;
}

/** Auth is only enforced when SITE_PASSWORD is set. */
export function isAuthEnabled(): boolean {
  return Boolean(getSitePassword());
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC token derived from the site password (Edge + Node compatible). */
export async function expectedAuthToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(AUTH_MESSAGE),
  );
  return toHex(signature);
}

export async function isValidAuthToken(
  token: string | undefined,
): Promise<boolean> {
  const password = getSitePassword();
  if (!password || !token) return false;
  const expected = await expectedAuthToken(password);
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function passwordsMatch(
  input: string,
  expected: string,
): Promise<boolean> {
  const a = await expectedAuthToken(input);
  const b = await expectedAuthToken(expected);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
