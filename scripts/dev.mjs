import { spawn } from "node:child_process";

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
const poller = start(["scripts/poll-fireflies.mjs"]);

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

poller.on("exit", (code) => {
  if (!shuttingDown && code && code !== 0) {
    console.error("[fireflies] Poller exited; Next.js will continue running.");
  }
});
