import os from "os";
import type { NextConfig } from "next";

/** Next.js blocks /_next assets from unknown hosts in dev. */
function localDevOrigins(): string[] {
  const origins = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const ipv4 = addr.family === "IPv4" || addr.family === 4;
      if (ipv4 && !addr.internal) origins.add(addr.address);
    }
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  // Allow LAN-IP access in dev (phones / other devices on the network).
  allowedDevOrigins: localDevOrigins(),
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
