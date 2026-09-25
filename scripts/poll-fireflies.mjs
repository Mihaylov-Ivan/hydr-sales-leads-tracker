import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));

// Keep in sync with src/lib/feature-flags.ts → FEATURE_FIREFLIES
const FEATURE_FIREFLIES = false;

const once = process.argv.includes("--once");
const intervalMs = Math.max(
  60_000,
  Number(process.env.FIREFLIES_POLL_INTERVAL_MS) || 5 * 60_000,
);
const baseUrl = (
  process.env.HYDR_LOCAL_URL?.trim() || "http://127.0.0.1:3000"
).replace(/\/$/, "");
const secret = process.env.FIREFLIES_POLL_SECRET?.trim();
const apiKey = process.env.FIREFLIES_API_KEY?.trim();

if (!FEATURE_FIREFLIES) {
  console.log("[fireflies] Integration disabled (feature flag).");
  process.exit(0);
}

if (!secret || !apiKey) {
  console.log(
    "[fireflies] Polling disabled. Set FIREFLIES_API_KEY and FIREFLIES_POLL_SECRET in .env.local.",
  );
  process.exit(0);
}

let stopped = false;

async function poll() {
  try {
    const response = await fetch(`${baseUrl}/api/integrations/fireflies`, {
      method: "POST",
      headers: {
        "x-hydr-fireflies-secret": secret,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        body?.error || `Hydr Fireflies sync failed (${response.status}).`,
      );
    }
    const timestamp = new Date().toISOString();
    console.log(
      `[fireflies] ${timestamp} imported=${body.imported ?? 0} discovered=${body.discovered ?? 0} already_present=${body.already_present ?? 0}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[fireflies] ${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

if (once) {
  const ok = await poll();
  process.exit(ok ? 0 : 1);
}

while (!stopped) {
  const ok = await poll();
  // The app may still be starting when the poller launches. Retry failures
  // quickly instead of waiting the full normal interval.
  const delayMs = ok ? intervalMs : Math.min(intervalMs, 15_000);
  const step = 1000;
  let waited = 0;
  while (!stopped && waited < delayMs) {
    await sleep(Math.min(step, delayMs - waited));
    waited += step;
  }
}
