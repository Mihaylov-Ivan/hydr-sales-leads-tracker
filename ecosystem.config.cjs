module.exports = {
  apps: [
    {
      name: "hydr-sales-leads-tracker",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      interpreter: "node",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "hydr-sales-leads-https",
      cwd: __dirname,
      script: "scripts/https-proxy.mjs",
      interpreter: "node",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        HTTPS_PORT: "3443",
        TARGET_ORIGIN: "http://127.0.0.1:3000",
      },
    },
  ],
};
