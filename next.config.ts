import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN-IP access in dev (phones / other devices on the network).
  allowedDevOrigins: ["192.168.1.104"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
