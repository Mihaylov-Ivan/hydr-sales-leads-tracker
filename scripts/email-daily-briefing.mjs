#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

const baseUrl = (
  process.env.CRM_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/$/, "");
const secret = (
  process.env.BRIEFING_EMAIL_CRON_SECRET ||
  process.env.AI_SUMMARY_CRON_SECRET ||
  ""
).trim();

if (!secret) {
  console.error(
    "BRIEFING_EMAIL_CRON_SECRET or AI_SUMMARY_CRON_SECRET is required.",
  );
  process.exit(1);
}

if (/^https:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl)) {
  console.error(
    `CRM_BASE_URL is ${baseUrl} but the local Next.js server is HTTP.\n` +
      `Set CRM_BASE_URL=http://127.0.0.1:3000 in .env.local (remove any https:// line).`,
  );
  process.exit(1);
}

const force = process.argv.includes("--force");
console.log(`POST ${baseUrl}/api/briefings/email-daily${force ? " (force)" : ""}`);

let response;
try {
  response = await fetch(`${baseUrl}/api/briefings/email-daily`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(force ? { force: true } : {}),
  });
} catch (err) {
  const cause = err && typeof err === "object" && "cause" in err ? err.cause : null;
  console.error(`Request to ${baseUrl} failed:`, err instanceof Error ? err.message : err);
  if (cause) console.error(cause);
  process.exit(1);
}

const body = await response.text();
if (!response.ok) {
  console.error(`Daily briefing email failed (${response.status}): ${body}`);
  process.exit(1);
}

console.log(body);
