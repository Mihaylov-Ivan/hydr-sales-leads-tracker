import { spawn } from "node:child_process";

// Keep in sync with src/lib/feature-flags.ts → FEATURE_FIREFLIES
const FEATURE_FIREFLIES = false;

const children = new Set();
let shuttingDown = false;

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

const next = start(["node_modules/next/dist/bin/next", "dev"]);
const poller = FEATURE_FIREFLIES
  ? start(["scripts/poll-fireflies.mjs"])
  : null;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 150).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

next.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

if (poller) {
  poller.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.error("[fireflies] Poller exited; Next.js will continue running.");
    }
  });
} else {
  console.log("[fireflies] Poller not started (feature flag disabled).");
}
