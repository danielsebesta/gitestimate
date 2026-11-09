/**
 * Minimal CORS proxy for GitHub OAuth Device Flow.
 * Whitelists exactly the two endpoints the flow needs, forwards to
 * github.com, adds ACAO. Deploy: `wrangler deploy` (see README).
 *
 * Route it under your app, e.g. https://your.app/api/oauth/*
 * and set VITE_OAUTH_PROXY=https://your.app/api/oauth
 */

const GITHUB = "https://github.com";

const ALLOWED: Record<string, string> = {
  "/login/device/code": "POST",
  "/login/oauth/access_token": "POST",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/oauth/, "") || url.pathname;
    const method = ALLOWED[path];

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
