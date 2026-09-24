/**
 * Terminate HTTPS and proxy to the Next.js app on localhost:3000.
 * Needed so LAN clients (http://192.168.x.x) get a secure context for WebRTC/mic.
 *
 * Usage: node scripts/https-proxy.mjs
 * Env: HTTPS_PORT (default 3443), TARGET_ORIGIN (default http://127.0.0.1:3000)
 */
import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certPath = path.join(root, "certs", "cert.pem");
const keyPath = path.join(root, "certs", "key.pem");
const httpsPort = Number(process.env.HTTPS_PORT || 3443);
const target = new URL(process.env.TARGET_ORIGIN || "http://127.0.0.1:3000");

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error(
    `Missing TLS files.\nExpected:\n  ${certPath}\n  ${keyPath}\nGenerate them first (see scripts/generate-dev-cert.mjs).`,
  );
  process.exit(1);
}

const agent = new http.Agent({ keepAlive: true });

function proxy(req, res) {
  const headers = { ...req.headers, host: target.host };
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = req.headers.host ?? `localhost:${httpsPort}`;

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers,
      agent,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    console.error("[https-proxy] upstream error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end("Bad gateway: Next.js is not reachable on " + target.origin);
  });

  req.pipe(upstream);
}

const server = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  },
  proxy,
);

server.on("upgrade", (req, socket, head) => {
  const headers = { ...req.headers, host: target.host };
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = req.headers.host ?? `localhost:${httpsPort}`;

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers,
    agent,
  });

  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (upHead.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });

  upstream.on("error", (err) => {
    console.error("[https-proxy] ws upstream error:", err.message);
    socket.destroy();
  });

  upstream.end(head);
});

server.listen(httpsPort, "0.0.0.0", () => {
  console.log(
    `HTTPS proxy listening on https://0.0.0.0:${httpsPort} → ${target.origin}`,
  );
});
