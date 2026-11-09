/**
 * GitHub OAuth for the SPA.
 *
 * Primary: authorization-code (redirect) — Worker injects the client secret
 * when exchanging `code` for a token (secret never ships in the bundle).
 * Backup: Device Flow — no secret, user enters a code at github.com/login/device.
 *
 * GitHub's OAuth POSTs have no CORS headers, so they go through OAUTH_PROXY
 * (Vite /api/oauth in dev, same-origin Worker in production).
 */

const SCOPE = "repo";

export const OAUTH_PROXY =
  (import.meta.env.VITE_OAUTH_PROXY as string | undefined) ?? "/api/oauth";

const STATE_KEY = "gh_oauth_state";

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

/** Redirect URI registered on the OAuth App (origin root). */
export function oauthRedirectUri(): string {
  return `${window.location.origin}/`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Kick off the normal GitHub authorize redirect. */
export function beginWebOAuth(clientId: string): void {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  window.location.assign(url.toString());
}

export interface OAuthCallback {
  code: string;
  state: string;
}

/** Read `?code=&state=` from the URL after GitHub redirects back. */
export function readOAuthCallback(): OAuthCallback | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return null;
  return { code, state };
}

/** Drop OAuth query params without a full reload. */
export function clearOAuthCallbackFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  const q = url.searchParams.toString();
  window.history.replaceState(null, "", url.pathname + (q ? `?${q}` : "") + url.hash);
}

/**
 * Exchange an authorization code for an access token via the proxy.
 * The Worker (or Vite middleware) injects `client_secret`.
 */
export async function exchangeCodeForToken(
  clientId: string,
  code: string,
  state: string,
): Promise<string> {
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!expected || expected !== state) {
    throw new Error("OAuth state mismatch — try signing in again.");
  }

  const res = await post("/login/oauth/access_token", {
    client_id: clientId,
    code,
    redirect_uri: oauthRedirectUri(),
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed (${res.status})`);
  const j = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (j.access_token) return j.access_token;
  throw new Error(
    j.error_description ||
      (j.error === "incorrect_client_credentials"
        ? "OAuth client secret missing on the server — see README."
        : `OAuth error: ${j.error ?? "unknown"}`),
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
    throw new Error(
      j.error === "unauthorized"
        ? "Device Flow is not enabled for this OAuth app."
        : `OAuth error: ${j.error ?? res.status}`,
    );
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
