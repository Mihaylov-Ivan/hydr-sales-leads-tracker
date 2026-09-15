#!/usr/bin/env node
/**
 * Hash a password with the same scrypt format used by the app, and print
 * SQL to set it on a team_members row.
 *
 * Usage:
 *   node scripts/seed-admin-password.mjs
 *   node scripts/seed-admin-password.mjs admin "YourSecurePassword"
 *   node scripts/seed-admin-password.mjs andrew "TempPass123"
 *
 * Then paste/run the printed SQL in the Supabase SQL Editor.
 * Never commit plaintext passwords.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

/** @param {string} password */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** @param {string} password @param {string} encoded */
export function verifyPassword(password, encoded) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

const username = (process.argv[2] || "admin").trim().toLowerCase();
const password = process.argv[3] || "";

if (!password) {
  console.error(
    "Usage: node scripts/seed-admin-password.mjs <username> <password>",
  );
  console.error('Example: node scripts/seed-admin-password.mjs admin "ChangeMeNow!"');
  process.exit(1);
}

const encoded = hashPassword(password);
if (!verifyPassword(password, encoded)) {
  console.error("Internal check failed: hash did not verify.");
  process.exit(1);
}

const esc = encoded.replace(/'/g, "''");
const userEsc = username.replace(/'/g, "''");

console.log(`-- Set password for username '${username}'`);
console.log(`update public.team_members`);
console.log(`set`);
console.log(`  password_hash = '${esc}',`);
console.log(`  must_change_password = true,`);
console.log(`  updated_at = now()`);
console.log(`where lower(username) = lower('${userEsc}');`);
console.log("");
console.log("-- After running the SQL above, sign in with that username/password.");
console.log("-- Change the password from the app if must_change_password is true.");
