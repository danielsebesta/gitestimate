/**
 * GitHub OAuth Device Flow — the only OAuth grant that works for public
 * clients without a client secret. GitHub's OAuth endpoints send no CORS
 * headers, so the two POSTs go through OAUTH_PROXY (Vite dev proxy, or the
 * bundled Cloudflare worker in workers/).
 */

const SCOPE = "repo"; // read+write needed only for private repo metadata/commits

export const OAUTH_PROXY =
  (import.meta.env.VITE_OAUTH_PROXY as string | undefined) ?? "/api/oauth";

export function oauthClientId(): string | undefined {
  const params = new URLSearchParams(window.location.search).get("oauth_client_id");
  if (params) {
    localStorage.setItem("gh_oauth_client_id", params);
    return params;
  }
  return (
    (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ||
    localStorage.getItem("gh_oauth_client_id") ||
    undefined
  );
}

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

async function post(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(`${OAUTH_PROXY}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

export async function startDeviceFlow(clientId: string): Promise<DeviceCode> {
  const res = await post("/login/device/code", { client_id: clientId, scope: SCOPE });
  if (!res.ok) throw new Error(`OAuth start failed (${res.status})`);
  const j = (await res.json()) as Partial<DeviceCode> & { error?: string };
  if (j.error || !j.device_code)
    throw new Error(j.error === "unauthorized" ? "Device Flow is not enabled for this OAuth app." : `OAuth error: ${j.error ?? res.status}`);
  return j as DeviceCode;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** polls the token endpoint until the user authorizes, the code expires, or abort fires */
export async function pollForToken(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  signal: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + expiresInSec * 1000;
  let interval = intervalSec * 1000;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("cancelled");
    await sleep(interval);
    const res = await post("/login/oauth/access_token", {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const j = (await res.json()) as {
      access_token?: string;
      error?: string;
      interval?: number;
    };
    if (j.access_token) return j.access_token;
    if (j.error === "authorization_pending") continue;
    if (j.error === "slow_down") {
      interval = (j.interval ?? interval / 1000 + 5) * 1000;
      continue;
    }
    if (j.error === "expired_token") throw new Error("The code expired — try again.");
    if (j.error === "access_denied") throw new Error("Authorization declined.");
    throw new Error(`OAuth error: ${j.error ?? res.status}`);
  }
  throw new Error("The code expired — try again.");
}
