/**
 * Minimal CORS proxy for GitHub OAuth Device Flow.
 * Whitelists exactly the two endpoints the flow needs, forwards to
 * github.com, adds ACAO. Deploy: `wrangler deploy` (see README).
 *
 * Route it under your app, e.g. https://your.app/api/oauth/*
 * and set VITE_OAUTH_PROXY=https://your.app/api/oauth
 *
 * Origins: localhost dev origins are always allowed; add your deployed
 * origin(s) via the ALLOWED_ORIGINS var (comma-separated), e.g.
 *   ALLOWED_ORIGINS = "https://you.github.io,https://gitestimate.example.com"
 */

const GITHUB = "https://github.com";

const ALLOWED: Record<string, string> = {
  "/login/device/code": "POST",
  "/login/oauth/access_token": "POST",
};

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

interface Env {
  ALLOWED_ORIGINS?: string;
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const extra = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra].includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    Vary: "Origin",
  };
  // reflect the origin only when allowed — disallowed origins get no ACAO
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/oauth/, "") || url.pathname;
    const method = ALLOWED[path];
    const cors = corsHeaders(allowedOrigin(request, env));

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (!method || request.method !== method)
      return new Response("not found", { status: 404, headers: cors });

    const upstream = await fetch(`${GITHUB}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": request.headers.get("Content-Type") ?? "application/x-www-form-urlencoded",
      },
      body: await request.text(),
    });
    const res = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    res.headers.delete("Set-Cookie");
    return res;
  },
};
