#!/usr/bin/env node

const baseUrl = (process.env.CRM_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const secret = (process.env.AI_SUMMARY_CRON_SECRET || "").trim();

if (!secret) {
  console.error("AI_SUMMARY_CRON_SECRET is required.");
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
  console.error(`Project summary refresh failed (${response.status}): ${body}`);
  process.exit(1);
}

console.log(body);
