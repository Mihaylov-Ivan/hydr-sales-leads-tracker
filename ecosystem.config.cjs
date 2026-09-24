module.exports = {
  apps: [
    {
      name: "hydr-sales-leads-tracker",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      interpreter: "node",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
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
        HTTPS_PORT: "3000",
        TARGET_ORIGIN: "http://127.0.0.1:3001",
      },
    },
  ],
};
