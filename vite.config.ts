import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED: Record<string, string> = {
  "/login/device/code": "POST",
  "/login/oauth/access_token": "POST",
};

/** Dev-only OAuth bridge — same paths as the production Worker. */
function oauthDevProxy(clientSecret: string): Plugin {
  return {
    name: "gitestimate-oauth-proxy",
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          const rawUrl = req.url ?? "/";
          if (!rawUrl.startsWith("/api/oauth")) {
            next();
            return;
          }

          try {
            const url = new URL(rawUrl, "http://localhost");
            const ghPath = url.pathname.replace(/^\/api\/oauth/, "") || "/";

            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }
            const method = ALLOWED[ghPath];
            if (!method || req.method !== method) {
              res.statusCode = 404;
              res.end("not found");
              return;
            }

            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            let body = Buffer.concat(chunks).toString("utf8");

            if (ghPath === "/login/oauth/access_token") {
              const params = new URLSearchParams(body);
              if (params.has("code") && !params.has("device_code")) {
                if (!clientSecret) {
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(
                    JSON.stringify({
                      error: "server_error",
                      error_description:
                        "Set GITHUB_CLIENT_SECRET in .env for local web OAuth.",
                    }),
                  );
                  return;
                }
                params.set("client_secret", clientSecret);
                body = params.toString();
              }
            }

            const upstream = await fetch(`https://github.com${ghPath}`, {
              method,
              headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body,
            });
            res.statusCode = upstream.status;
            const ct = upstream.headers.get("Content-Type");
            if (ct) res.setHeader("Content-Type", ct);
            res.end(Buffer.from(await upstream.arrayBuffer()));
          } catch (e) {
            next(e);
          }
        },
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), oauthDevProxy(env.GITHUB_CLIENT_SECRET || "")],
    base: "/",
    server: {
      allowedHosts: [".trycloudflare.com"],
    },
    test: {
      environment: "node",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
