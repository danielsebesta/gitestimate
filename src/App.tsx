import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@primer/react";
import {
  Box,
  Flash,
  Heading,
  IconButton,
  Link,
  PageLayout,
  Text,
} from "@primer/react";
import { Clock, Code2, Monitor, Moon, Sun } from "lucide-react";
import {
  enrichCommitPatches,
  enrichCommitStats,
  fetchBranches,
  fetchCodeFrequency,
  fetchCommits,
  fetchFilePaths,
  fetchLanguages,
  fetchRepo,
  fetchViewer,
  GitHubError,
  type GitHubUser,
  isAbortError,
  parseRepo,
} from "./lib/github";
import {
  beginWebOAuth,
  clearOAuthCallbackFromUrl,
  exchangeCodeForToken,
  oauthClientId,
  pollForToken,
  readOAuthCallback,
  startDeviceFlow,
} from "./lib/oauth";
import { detectFiles } from "./lib/agents";
import RepoForm, { type LoadPhase } from "./components/RepoForm";
import AuthControls, { type DeviceAuth } from "./components/AuthControls";
import ResultsPanel, { type DoneState } from "./components/ResultsPanel";

type Status =
  | { kind: "idle" }
  | {
      kind: "loading";
      phase: LoadPhase;
      done: number;
      total: number;
      repoTotal?: number;
    }
  | { kind: "done"; data: DoneState }
  | { kind: "error"; message: string };

const REPO_URL = "https://github.com/danielsebesta/gitestimate";

/** ?token=… arrives via share links — stash it, then strip it from the URL. */
function parseToken(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("token");
  if (t && /^[a-zA-Z0-9_]+$/.test(t)) {
    sessionStorage.setItem("gh_token", t);
    params.delete("token");
    const q = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (q ? `?${q}` : "") + window.location.hash,
    );
    return t;
  }
  return sessionStorage.getItem("gh_token") ?? undefined;
}

type Mode = "auto" | "light" | "dark";
const MODE_ORDER: Mode[] = ["auto", "light", "dark"];
const MODE_ICON = { auto: Monitor, light: Sun, dark: Moon } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const { colorMode, setColorMode } = useTheme();
  const mode: Mode = colorMode === "day" ? "light" : colorMode === "night" ? "dark" : (colorMode as Mode);
  const cycleMode = useCallback(() => {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    localStorage.setItem("color-mode", next);
    document.documentElement.dataset.colorMode = next;
    setColorMode(next);
  }, [mode, setColorMode]);

  const [input, setInput] = useState("");
  const [token, setToken] = useState<string>(() => parseToken() ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const authAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);

  // Resolve GitHub profile whenever the token changes
  useEffect(() => {
    const t = token.trim();
    if (!t) {
      setUser(null);
      setUserLoading(false);
      return;
    }
    const abort = new AbortController();
    setUserLoading(true);
    void (async () => {
      try {
        const u = await fetchViewer(t, abort.signal);
        if (!abort.signal.aborted) setUser(u);
      } catch {
        if (!abort.signal.aborted) setUser(null);
      } finally {
        if (!abort.signal.aborted) setUserLoading(false);
      }
    })();
    return () => abort.abort();
  }, [token]);

  const requireClientId = useCallback((): string | null => {
    const clientId = oauthClientId();
    if (!clientId) {
      setAuthError(
        "No OAuth app configured — set VITE_GITHUB_CLIENT_ID (or ?oauth_client_id=), see README.",
      );
      return null;
    }
    return clientId;
  }, []);

  /** Primary: redirect to GitHub authorize. */
  const signIn = useCallback(() => {
    const clientId = requireClientId();
    if (!clientId) return;
    setAuthError(null);
    beginWebOAuth(clientId);
  }, [requireClientId]);

  /** Backup: Device Flow (code at github.com/login/device). */
  const deviceSignIn = useCallback(async () => {
    const clientId = requireClientId();
    if (!clientId) return;
    setAuthError(null);
    authAbort.current?.abort();
    const abort = new AbortController();
    authAbort.current = abort;
    try {
      const d = await startDeviceFlow(clientId);
      setDeviceAuth({ userCode: d.user_code, verificationUri: d.verification_uri });
      const t = await pollForToken(
        clientId,
        d.device_code,
        d.interval,
        d.expires_in,
        abort.signal,
      );
      sessionStorage.setItem("gh_token", t);
      setToken(t);
      setDeviceAuth(null);
    } catch (e) {
      setDeviceAuth(null);
      if ((e as Error).message !== "cancelled")
        setAuthError(e instanceof Error ? e.message : "Sign-in failed.");
    }
  }, [requireClientId]);

  // Finish web OAuth after GitHub redirects back with ?code=&state=
  useEffect(() => {
    const cb = readOAuthCallback();
    if (!cb) return;
    const clientId = oauthClientId();
    if (!clientId) {
      clearOAuthCallbackFromUrl();
      setAuthError("OAuth client id missing after redirect.");
      return;
    }
    let cancelled = false;
    setExchanging(true);
    setAuthError(null);
    void (async () => {
      try {
        const t = await exchangeCodeForToken(clientId, cb.code, cb.state);
        if (cancelled) return;
        sessionStorage.setItem("gh_token", t);
        setToken(t);
      } catch (e) {
        if (!cancelled)
          setAuthError(e instanceof Error ? e.message : "Sign-in failed.");
      } finally {
        clearOAuthCallbackFromUrl();
        if (!cancelled) setExchanging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem("gh_token");
    setToken("");
    setUser(null);
  }, []);

  const onTokenChange = useCallback((v: string) => {
    const t = v.trim();
    if (t) sessionStorage.setItem("gh_token", t);
    else sessionStorage.removeItem("gh_token");
    setToken(t);
  }, []);

  const cancelDevice = useCallback(() => {
    authAbort.current?.abort();
    setDeviceAuth(null);
  }, []);

  const cancelRun = useCallback(() => {
    runAbort.current?.abort();
    setStatus({ kind: "idle" });
  }, []);

  const runFor = useCallback(
    async (target?: string, branch?: string) => {
      const parsed = parseRepo(target ?? input);
      if (!parsed) {
        setStatus({ kind: "error", message: "Enter a repository as owner/repo or a GitHub URL." });
        return;
      }
      // a new run supersedes any in-flight one; its stale responses are ignored
      runAbort.current?.abort();
      const abort = new AbortController();
      runAbort.current = abort;
      const { signal } = abort;
      const setLoad = (phase: LoadPhase, done: number, total: number, repoTotal?: number) => {
        if (!signal.aborted)
          setStatus({
            kind: "loading",
            phase,
            done,
            total: Math.max(total, 0),
            repoTotal,
          });
      };
      setStatus({ kind: "loading", phase: "commits", done: 0, total: 0 });
      try {
        const t = token.trim() || undefined;
        const repo = await fetchRepo(parsed.owner, parsed.repo, t, signal);
        const sha = branch ?? repo.defaultBranch;
        const [commitsRes, paths, languages, branches] = await Promise.all([
          fetchCommits(
            parsed.owner,
            parsed.repo,
            t,
            (done, target, repoTotal) => setLoad("commits", done, target, repoTotal),
            { sha, signal },
          ),
          fetchFilePaths(parsed.owner, parsed.repo, sha, t, signal).catch(() => [] as string[]),
          fetchLanguages(parsed.owner, parsed.repo, t, signal).catch(
            () => ({}) as Record<string, number>,
          ),
          fetchBranches(parsed.owner, parsed.repo, t, signal).catch(() => [] as string[]),
        ]);
        if (signal.aborted) return;
        if (t)
          await enrichCommitStats(
            parsed.owner,
            parsed.repo,
            commitsRes.commits,
            t,
            (done, total) => setLoad("stats", done, total, commitsRes.totalCommits),
            signal,
          ).catch(() => 0);
        if (signal.aborted) return;
        // sample patches for comment-density heuristics (public repos OK without token)
        await enrichCommitPatches(
          parsed.owner,
          parsed.repo,
          commitsRes.commits,
          t,
          signal,
          (done, total) => setLoad("patches", done, total, commitsRes.totalCommits),
        ).catch(() => 0);
        if (signal.aborted) return;
        setLoad("charts", 0, 1, commitsRes.totalCommits);
        // stats endpoints are computed async — retry once
        let codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t, signal).catch(
          () => null,
        );
        if (codeFreq === null) {
          await sleep(2500);
          if (signal.aborted) return;
          codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t, signal).catch(() => null);
        }
        setLoad("charts", 1, 1, commitsRes.totalCommits);
        if (signal.aborted) return;
        setStatus({
          kind: "done",
          data: {
            repo,
            commits: commitsRes.commits,
            totalCommits: commitsRes.totalCommits,
            capped: commitsRes.capped,
            aiFiles: detectFiles(paths),
            codeFreq,
            languages,
            branches: branches.includes(sha) ? branches : [sha, ...branches],
            branch: sha,
          },
        });
        window.history.replaceState(null, "", `/${parsed.owner}/${parsed.repo}`);
      } catch (e) {
        if (signal.aborted || isAbortError(e)) return;
        setStatus({
          kind: "error",
          message: e instanceof GitHubError ? e.message : "Network error — try again.",
        });
      }
    },
    [input, token],
  );

  const rerunBranch = useCallback(
    (branch: string) => {
      if (status.kind === "done") runFor(status.data.repo.fullName, branch);
    },
    [runFor, status],
  );

  // /owner/name (or ?repo=…) → prefill + auto-run (shareable links)
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const q = path || new URLSearchParams(window.location.search).get("repo") || "";
    if (!parseRepo(q)) return;
    autoRan.current = true;
    setInput(q);
    void runFor(q);
  }, [runFor]);

  const loading = status.kind === "loading";

  return (
    <PageLayout padding="none" containerWidth="medium" sx={{ minHeight: "100vh" }}>
      <PageLayout.Header>
        <Box display="flex" alignItems="center" justifyContent="space-between" py={3}>
          <Box display="flex" alignItems="center" sx={{ gap: 2 }}>
            <Clock size={24} strokeWidth={2} />
            <Heading as="h1" sx={{ fontSize: 3, fontWeight: 600 }}>
              GitEstimate
            </Heading>
          </Box>
          <Box display="flex" alignItems="center" sx={{ gap: 1 }}>
            <IconButton
              icon={MODE_ICON[mode]}
              aria-label={`Color mode: ${mode}. Click to switch.`}
              title={`Theme: ${mode}`}
              onClick={cycleMode}
              variant="invisible"
            />
            <IconButton
              as="a"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              icon={Code2}
              aria-label="GitEstimate on GitHub"
              variant="invisible"
            />
          </Box>
        </Box>
      </PageLayout.Header>

      <PageLayout.Content>
        <Box sx={{ maxWidth: 768, mx: "auto", pt: [3, 4], px: 3 }}>
          <Text as="p" color="fg.muted" sx={{ mb: 3 }}>
            Estimate how long a repo took from its commit history.
          </Text>

          <RepoForm
            input={input}
            onInputChange={setInput}
            loading={loading}
            idle={status.kind === "idle"}
            progress={status.kind === "loading" ? status : null}
            onRun={runFor}
            onCancel={cancelRun}
            branches={status.kind === "done" ? status.data.branches : []}
            branch={status.kind === "done" ? status.data.branch : ""}
            onBranchChange={rerunBranch}
          />

          <AuthControls
            token={token}
            onTokenChange={onTokenChange}
            onSignIn={signIn}
            onDeviceSignIn={deviceSignIn}
            onSignOut={signOut}
            busy={loading}
            deviceAuth={deviceAuth}
            onCancelDevice={cancelDevice}
            authError={authError}
            exchanging={exchanging}
            user={user}
            userLoading={userLoading}
          />

          {status.kind === "error" && (
            <Flash variant="danger" sx={{ mt: 3 }}>
              {status.message}
            </Flash>
          )}

          {status.kind === "done" && (
            <ResultsPanel data={status.data} viewerLogin={user?.login} />
          )}
        </Box>
      </PageLayout.Content>

      <PageLayout.Footer divider="line">
        <Box
          display="flex"
          justifyContent="space-between"
          py={3}
          sx={{ flexWrap: "wrap", gap: 1, px: [3, 0] }}
        >
          <Text size="small" color="fg.muted">
            MIT · runs in your browser · not affiliated with GitHub
          </Text>
          <Text size="small" color="fg.muted">
            GitEstimate · built by{" "}
            <Link href="https://sebesta.dev" target="_blank" rel="noreferrer" muted>
              Daniel Šebesta
            </Link>
          </Text>
        </Box>
      </PageLayout.Footer>
    </PageLayout>
  );
}
