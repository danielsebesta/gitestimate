import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@primer/react";
import {
  Box,
  Flash,
  FormControl,
  Heading,
  IconButton,
  Link,
  PageLayout,
  Select,
  Text,
} from "@primer/react";
import {
  ClockIcon,
  DeviceDesktopIcon,
  MarkGithubIcon,
  MoonIcon,
  SunIcon,
} from "@primer/octicons-react";
import {
  enrichCommitStats,
  fetchBranches,
  fetchCodeFrequency,
  fetchCommits,
  fetchFilePaths,
  fetchLanguages,
  fetchRepo,
  GitHubError,
  isAbortError,
  parseRepo,
} from "./lib/github";
import { oauthClientId, pollForToken, startDeviceFlow } from "./lib/oauth";
import { detectFiles } from "./lib/agents";
import RepoForm from "./components/RepoForm";
import AuthControls, { type DeviceAuth } from "./components/AuthControls";
import ResultsPanel, { type DoneState } from "./components/ResultsPanel";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; fetched: number; target: number; total: number }
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
const MODE_ICON = { auto: DeviceDesktopIcon, light: SunIcon, dark: MoonIcon } as const;

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
  const [gap, setGap] = useState("120");
  const [credit, setCredit] = useState("30");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);

  const signIn = useCallback(async () => {
    const clientId = oauthClientId();
    if (!clientId) {
      setAuthError(
        "No OAuth app configured — set VITE_GITHUB_CLIENT_ID (or ?oauth_client_id=), see README.",
      );
      return;
    }
    setAuthError(null);
    authAbort.current?.abort();
    const abort = new AbortController();
    authAbort.current = abort;
    try {
      const d = await startDeviceFlow(clientId);
      setDeviceAuth({ userCode: d.user_code, verificationUri: d.verification_uri });
      const t = await pollForToken(clientId, d.device_code, d.interval, d.expires_in, abort.signal);
      sessionStorage.setItem("gh_token", t);
      setToken(t);
      setDeviceAuth(null);
    } catch (e) {
      setDeviceAuth(null);
      if ((e as Error).message !== "cancelled")
        setAuthError(e instanceof Error ? e.message : "Sign-in failed.");
    }
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem("gh_token");
    setToken("");
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
      const progress = (fetched: number, t: number, total: number) => {
        if (!signal.aborted) setStatus({ kind: "loading", fetched, target: t, total });
      };
      setStatus({ kind: "loading", fetched: 0, target: 0, total: 0 });
      try {
        const t = token.trim() || undefined;
        const repo = await fetchRepo(parsed.owner, parsed.repo, t, signal);
        const sha = branch ?? repo.defaultBranch;
        const [commitsRes, paths, languages, branches] = await Promise.all([
          fetchCommits(parsed.owner, parsed.repo, t, progress, { sha, signal }),
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
            (n, total) =>
              progress(n, total, commitsRes.commits.length),
            signal,
          ).catch(() => 0);
        if (signal.aborted) return;
        // stats endpoints are computed async — retry once
        let codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t, signal).catch(
          () => null,
        );
        if (codeFreq === null) {
          await sleep(2500);
          if (signal.aborted) return;
          codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t, signal).catch(() => null);
        }
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
            <ClockIcon size={24} />
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
              icon={MarkGithubIcon}
              aria-label="GitEstimate on GitHub"
              variant="invisible"
            />
          </Box>
        </Box>
      </PageLayout.Header>

      <PageLayout.Content>
        <Box sx={{ maxWidth: 768, mx: "auto", pt: [3, 4], px: 3 }}>
          <Text as="p" color="fg.muted" sx={{ mb: 3 }}>
            Paste a repository to estimate the time its authors spent building it,
            reconstructed from commit timestamps.
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
            onTokenChange={setToken}
            onSignIn={signIn}
            onSignOut={signOut}
            busy={loading}
            deviceAuth={deviceAuth}
            onCancelDevice={cancelDevice}
            authError={authError}
          >
            <FormControl sx={{ flex: ["1 1 calc(50% - 8px)", "0 0 auto"], minWidth: 110 }}>
              <FormControl.Label visuallyHidden>Session gap</FormControl.Label>
              <Select value={gap} onChange={(e) => setGap(e.target.value)} size="small" block>
                <Select.Option value="60">Gap 1 h</Select.Option>
                <Select.Option value="120">Gap 2 h</Select.Option>
                <Select.Option value="180">Gap 3 h</Select.Option>
                <Select.Option value="240">Gap 4 h</Select.Option>
              </Select>
            </FormControl>
            <FormControl sx={{ flex: ["1 1 calc(50% - 8px)", "0 0 auto"], minWidth: 150 }}>
              <FormControl.Label visuallyHidden>Session credit</FormControl.Label>
              <Select value={credit} onChange={(e) => setCredit(e.target.value)} size="small" block>
                <Select.Option value="15">+15 min/session</Select.Option>
                <Select.Option value="30">+30 min/session</Select.Option>
                <Select.Option value="45">+45 min/session</Select.Option>
                <Select.Option value="60">+60 min/session</Select.Option>
              </Select>
            </FormControl>
          </AuthControls>

          {status.kind === "error" && (
            <Flash variant="danger" sx={{ mt: 3 }}>
              {status.message}
            </Flash>
          )}

          {status.kind === "done" && (
            <ResultsPanel data={status.data} gap={Number(gap)} credit={Number(credit)} />
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
            MIT-licensed · estimates run in your browser · not affiliated with GitHub, Inc.
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
