/**
 * Issue a locally-trusted HTTPS cert for localhost + LAN IPs.
 * Prefers mkcert (no browser warning). Falls back to openssl self-signed.
 *
 * Other machines must trust certs/rootCA.pem once (see console output).
 */
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certsDir = path.join(root, "certs");
fs.mkdirSync(certsDir, { recursive: true });

const ips = new Set(["127.0.0.1"]);
for (const addrs of Object.values(os.networkInterfaces())) {
  for (const addr of addrs ?? []) {
    if (addr.family === "IPv4" && !addr.internal) ips.add(addr.address);
  }
}

const names = ["localhost", ...ips];
const certPath = path.join(certsDir, "cert.pem");
const keyPath = path.join(certsDir, "key.pem");

const mkcertCandidates = [
  process.env.MKCERT_PATH,
  path.join(root, "tools", "mkcert.exe"),
  "mkcert",
].filter(Boolean);

function findMkcert() {
  for (const candidate of mkcertCandidates) {
    const r = spawnSync(candidate, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return candidate;
  }
  return null;
}

const mkcert = findMkcert();
if (mkcert) {
  process.env.CAROOT = certsDir;
  execFileSync(mkcert, ["-install"], { stdio: "inherit", env: process.env });
  execFileSync(
    mkcert,
    ["-cert-file", certPath, "-key-file", keyPath, ...names],
    { stdio: "inherit", env: process.env },
  );
  console.log(`\nTrusted cert written for: ${names.join(", ")}`);
  console.log(`CA root (share with other PCs): ${path.join(certsDir, "rootCA.pem")}`);
  console.log(`
On each OTHER machine that opens https://192.168.x.x:3443:
  1. Copy certs\\rootCA.pem to that PC
  2. Double-click it → Install Certificate → Local Machine
  3. Place in "Trusted Root Certification Authorities" → Finish
  4. Restart the browser
`);
  process.exit(0);
}

console.warn("mkcert not found — falling back to openssl (browser will warn).");
console.warn("Put mkcert at tools/mkcert.exe or on PATH to remove the warning.");

const altNames = ["DNS.1 = localhost", ...[...ips].map((ip, i) => `IP.${i + 1} = ${ip}`)];
const cnf = `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = hydr-sales-leads-tracker.local

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
${altNames.join("\n")}
`;

const cnfPath = path.join(certsDir, "openssl.cnf");
fs.writeFileSync(cnfPath, cnf, "utf8");

const opensslCandidates = [
  process.env.OPENSSL_PATH,
  "openssl",
  "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
].filter(Boolean);

let openssl = null;
for (const candidate of opensslCandidates) {
  try {
    execFileSync(candidate, ["version"], { stdio: "ignore" });
    openssl = candidate;
    break;
  } catch {
    // try next
  }
}

if (!openssl) {
  console.error("Neither mkcert nor openssl found.");
  process.exit(1);
}

execFileSync(
  openssl,
  [
    "req",
    "-x509",
    "-nodes",
    "-days",
    "825",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-config",
    cnfPath,
  ],
  { stdio: "inherit" },
);

console.log(`Wrote ${certPath}`);
console.log(`Wrote ${keyPath}`);
