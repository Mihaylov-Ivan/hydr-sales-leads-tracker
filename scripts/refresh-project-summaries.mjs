#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\\r?\\n/)) {
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
).replace(/\\/$/, "");
const secret = (process.env.AI_SUMMARY_CRON_SECRET || "").trim();

if (!secret) {
  console.error(
    "AI_SUMMARY_CRON_SECRET is required. Add it to .env.local or the process environment.",
  );
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/ai/project-summaries/refresh`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body: JSON.stringify({}),
});

const body = await response.text();
if (!response.ok) {
  console.error(
    `Project summary refresh failed (${response.status}): ${body}`,
  );
  process.exit(1);
}

console.log(body);
