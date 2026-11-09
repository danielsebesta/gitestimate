import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    allowedHosts: [".trycloudflare.com"], // cloudflare quick tunnels for testing
    proxy: {
      // GitHub OAuth endpoints have no CORS headers — dev proxy for Device Flow
      "/api/oauth": {
        target: "https://github.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/oauth/, ""),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
