/**
 * GitEstimate Worker: static SPA + same-origin OAuth proxy.
 * Assets live in dist/; /api/oauth/* is proxied to github.com.
 * For the web authorization-code flow, injects GITHUB_CLIENT_SECRET
 * (set via `wrangler secret put GITHUB_CLIENT_SECRET`) so the SPA never
 * sees it. Device Flow POSTs are forwarded as-is (no secret).
 */

const GITHUB = "https://github.com";

const ALLOWED: Record<string, string> = {
  "/login/device/code": "POST",
  "/login/oauth/access_token": "POST",
};

interface Env {
  ASSETS: Fetcher;
  /** OAuth App client secret — required for web code exchange */
  GITHUB_CLIENT_SECRET?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https://avatars.githubusercontent.com https://github.githubassets.com; connect-src 'self' https://api.github.com https://github.com;",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/oauth")) {
      return proxyOAuth(request, url, env);
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      headers.set(k, v);
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  },
};

async function proxyOAuth(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const path = url.pathname.replace(/^\/api\/oauth/, "") || "/";
  const method = ALLOWED[path];

  const origin = request.headers.get("Origin");
  const cors: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    Vary: "Origin",
  };
  if (origin) cors["Access-Control-Allow-Origin"] = origin;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!method || request.method !== method) {
    return new Response("not found", { status: 404, headers: cors });
  }

  let body = await request.text();

  // Web OAuth: SPA sends client_id + code (+ redirect_uri). Inject secret.
  if (path === "/login/oauth/access_token") {
    const params = new URLSearchParams(body);
    const hasCode = params.has("code");
    const hasDevice = params.has("device_code");
    if (hasCode && !hasDevice) {
      if (!env.GITHUB_CLIENT_SECRET) {
        return new Response(
          JSON.stringify({
            error: "server_error",
            error_description:
              "GITHUB_CLIENT_SECRET is not configured on the Worker.",
          }),
          {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
      params.set("client_secret", env.GITHUB_CLIENT_SECRET);
      body = params.toString();
    }
  }

  const upstream = await fetch(`${GITHUB}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const res = new Response(upstream.body, upstream);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  res.headers.delete("Set-Cookie");
  return res;
}
