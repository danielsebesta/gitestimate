import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@primer/react";
import {
  Box,
  Button,
  CounterLabel,
  Flash,
  FormControl,
  Heading,
  IconButton,
  Label,
  Link,
  PageLayout,
  Select,
  Spinner,
  Text,
  TextInput,
} from "@primer/react";
import {
  CheckIcon,
  ClockIcon,
  CopilotIcon,
  DeviceDesktopIcon,
  GitCommitIcon,
  KeyIcon,
  LinkIcon,
  MarkGithubIcon,
  MoonIcon,
  SunIcon,
  PersonIcon,
  RepoForkedIcon,
  SearchIcon,
  StarIcon,
} from "@primer/octicons-react";
import {
  enrichCommitStats,
  fetchCodeFrequency,
  fetchCommits,
  fetchFilePaths,
  fetchLanguages,
  fetchRepo,
  GitHubError,
  parseRepo,
  type RepoInfo,
} from "./lib/github";
import { estimate, formatHours, type CommitSample, type EstimateResult } from "./lib/estimate";
import { detectCommit, detectFiles } from "./lib/agents";
import { oauthClientId, pollForToken, startDeviceFlow } from "./lib/oauth";
import { computeStats } from "./lib/stats";
import Timeline from "./components/Timeline";
import Heatmap from "./components/Heatmap";
import Histogram from "./components/Histogram";
import LocChart from "./components/LocChart";
import LanguageBar from "./components/LanguageBar";
import CommitList from "./components/CommitList";
import SessionList from "./components/SessionList";
import { StatGrid, StatCard } from "./components/StatGrid";

interface DoneState {
  repo: RepoInfo;
  commits: CommitSample[];
  totalCommits: number;
  capped: boolean;
  aiFiles: string[];
  codeFreq: Array<[number, number, number]> | null;
  languages: Record<string, number>;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading"; fetched: number; target: number; total: number }
  | { kind: "done"; data: DoneState }
  | { kind: "error"; message: string };

const EXAMPLES = ["danielsebesta/web", "danielsebesta/PaperBoat", "onlook-dev/onlook"];
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i));

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{ mt: 4, border: "1px solid", borderColor: "border.default", borderRadius: 2, p: [2, 3] }}
    >
      {title && (
        <Text size="small" sx={{ fontWeight: 600, display: "block", mb: 2 }}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
}

function parseToken(): string | undefined {
  const t = new URLSearchParams(window.location.search).get("token");
  if (t && /^[a-zA-Z0-9_]+$/.test(t)) return t;
  return sessionStorage.getItem("gh_token") ?? undefined;
}

interface DeviceAuth {
  userCode: string;
  verificationUri: string;
}

type Mode = "auto" | "light" | "dark";
const MODE_ORDER: Mode[] = ["auto", "light", "dark"];
const MODE_ICON = { auto: DeviceDesktopIcon, light: SunIcon, dark: MoonIcon } as const;

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
  const abortRef = useRef<AbortController | null>(null);

  const signIn = useCallback(async () => {
    const clientId = oauthClientId();
    if (!clientId) {
      setAuthError(
        "No OAuth app configured — set VITE_GITHUB_CLIENT_ID (or ?oauth_client_id=), see README.",
      );
      return;
    }
    setAuthError(null);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
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

  const runFor = useCallback(
    async (target?: string) => {
      const parsed = parseRepo(target ?? input);
      if (!parsed) {
        setStatus({ kind: "error", message: "Enter a repository as owner/repo or a GitHub URL." });
        return;
      }
      setStatus({ kind: "loading", fetched: 0, target: 0, total: 0 });
      try {
        const t = token.trim() || undefined;
        const repo = await fetchRepo(parsed.owner, parsed.repo, t);
        const [commitsRes, paths, languages] = await Promise.all([
          fetchCommits(parsed.owner, parsed.repo, t, (n, target, total) =>
            setStatus({ kind: "loading", fetched: n, target, total }),
          ),
          fetchFilePaths(parsed.owner, parsed.repo, repo.defaultBranch, t).catch(() => []),
          fetchLanguages(parsed.owner, parsed.repo, t).catch(() => ({})),
        ]);
        if (t)
          await enrichCommitStats(parsed.owner, parsed.repo, commitsRes.commits, t, (n, total) =>
            setStatus({ kind: "loading", fetched: n, target: total, total: commitsRes.commits.length }),
          ).catch(() => 0);
        // stats endpoints are computed async — retry once
        let codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t).catch(() => null);
        if (codeFreq === null) {
          await new Promise((r) => setTimeout(r, 2500));
          codeFreq = await fetchCodeFrequency(parsed.owner, parsed.repo, t).catch(() => null);
        }
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
          },
        });
        window.history.replaceState(null, "", `/${parsed.owner}/${parsed.repo}`);
      } catch (e) {
        setStatus({
          kind: "error",
          message: e instanceof GitHubError ? e.message : "Network error — try again.",
        });
      }
    },
    [input, token],
  );

  const run = useCallback(() => runFor(), [runFor]);

  const [copied, setCopied] = useState<"link" | "badge" | null>(null);

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

  const result: EstimateResult | null = useMemo(() => {
    if (status.kind !== "done") return null;
    return estimate(status.data.commits, {
      sessionGapMinutes: Number(gap),
      sessionCreditMinutes: Number(credit),
    });
  }, [status, gap, credit]);

  const stats = useMemo(() => {
    if (status.kind !== "done") return null;
    return computeStats(
      status.data.commits,
      (c) => detectCommit(c)?.strength === "authored",
    );
  }, [status]);

  const copyShare = useCallback(
    async (kind: "link" | "badge") => {
      if (status.kind !== "done" || !result) return;
      const url = `${window.location.origin}/${status.data.repo.fullName}`;
      const hours = formatHours(result.totalMinutes).replace(" ", "");
      const text =
        kind === "link"
          ? url
          : `[![dev time](https://img.shields.io/badge/dev%20time-${encodeURIComponent(hours)}-0969da)](${url})`;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(kind);
        setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
      } catch {
        /* clipboard denied — ignore */
      }
    },
    [status, result],
  );

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
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              icon={MarkGithubIcon}
              aria-label="GitHub"
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

          <Box display="flex" sx={{ gap: 2 }}>
            <TextInput
              leadingVisual={SearchIcon}
              placeholder="owner/repo or github.com/owner/repo"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && run()}
              sx={{ flex: 1, minWidth: 0 }}
              aria-label="Repository"
              autoFocus
              block
            />
            <Button variant="primary" onClick={run} disabled={loading} sx={{ flexShrink: 0 }}>
              {loading ? <Spinner size="small" /> : "Estimate"}
            </Button>
          </Box>
          {loading && (
            <Text as="p" size="small" color="fg.muted" sx={{ mt: 2 }}>
              Fetching commits… {status.fetched.toLocaleString()}
              {status.target > 0 && ` / ${status.target.toLocaleString()}`}
              {status.total > status.target &&
                ` — repo has ~${status.total.toLocaleString()}, capped at ${status.target.toLocaleString()}`}
            </Text>
          )}
          {status.kind === "idle" && (
            <Box display="flex" alignItems="center" sx={{ gap: 2, mt: 3, flexWrap: "wrap" }}>
              <Text size="small" color="fg.muted">
                Try:
              </Text>
              {EXAMPLES.map((r) => (
                <Button
                  key={r}
                  size="small"
                  onClick={() => {
                    setInput(r);
                    runFor(r);
                  }}
                  disabled={loading}
                >
                  {r}
                </Button>
              ))}
            </Box>
          )}

          <Box display="flex" sx={{ gap: 2, mt: 3, flexWrap: "wrap" }}>
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
            <Box display="flex" sx={{ gap: 2, flex: ["1 1 100%", "1 1 200px"], minWidth: 0 }}>
              <FormControl sx={{ flex: 1, minWidth: 0 }}>
                <FormControl.Label visuallyHidden>GitHub token</FormControl.Label>
                <TextInput
                  leadingVisual={KeyIcon}
                  placeholder="token (or sign in →)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  size="small"
                  block
                />
              </FormControl>
              <Button
                leadingVisual={MarkGithubIcon}
                onClick={signIn}
                disabled={status.kind === "loading" || deviceAuth !== null}
                size="small"
                sx={{ flexShrink: 0 }}
              >
                Sign in
              </Button>
            </Box>
          </Box>

          {deviceAuth && (
            <Flash variant="default" sx={{ mt: 3 }}>
              <Box display="flex" alignItems="center" sx={{ gap: 3, flexWrap: "wrap" }}>
                <Text>
                  Authorize at{" "}
                  <a href={deviceAuth.verificationUri} target="_blank" rel="noreferrer">
                    {deviceAuth.verificationUri}
                  </a>{" "}
                  with code
                </Text>
                <Text sx={{ fontFamily: "mono", fontWeight: 600, fontSize: 2 }}>
                  {deviceAuth.userCode}
                </Text>
                <Button
                  size="small"
                  variant="invisible"
                  onClick={() => {
                    abortRef.current?.abort();
                    setDeviceAuth(null);
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Flash>
          )}
          {authError && (
            <Flash variant="danger" sx={{ mt: 3 }}>
              {authError}
            </Flash>
          )}

          {status.kind === "error" && (
            <Flash variant="danger" sx={{ mt: 3 }}>
              {status.message}
            </Flash>
          )}

          {status.kind === "done" && result && stats && (
            <Box sx={{ mt: 4 }}>
              {status.data.repo.description && (
                <Text as="p" color="fg.muted" sx={{ mb: 2 }}>
                  {status.data.repo.description}
                </Text>
              )}
              <Box display="flex" alignItems="center" sx={{ gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Label variant="accent">
                  <GitCommitIcon size={12} /> {result.commitCount.toLocaleString()} commits
                </Label>
                <Label variant="accent">
                  <PersonIcon size={12} /> {result.authors.length}{" "}
                  {result.authors.length === 1 ? "author" : "authors"}
                </Label>
                <Label variant="accent">
                  <StarIcon size={12} /> {status.data.repo.stars.toLocaleString()}
                </Label>
                <Label variant="accent">
                  <RepoForkedIcon size={12} /> {status.data.repo.forks.toLocaleString()}
                </Label>
                {status.data.repo.license && <Label variant="accent">{status.data.repo.license}</Label>}
                {result.agentCommitCount > 0 && (
                  <Label variant="attention">
                    <CopilotIcon size={12} />{" "}
                    {result.agentCommitCount.toLocaleString()} agent-authored
                  </Label>
                )}
                {status.data.aiFiles.map((f) => (
                  <Label key={f} variant="sponsors">
                    {f}
                  </Label>
                ))}
              </Box>

              {status.data.capped && (
                <Flash variant="warning" sx={{ mb: 3 }}>
                  History capped: analyzed latest{" "}
                  {result.commitCount.toLocaleString()} of ~
                  {status.data.totalCommits.toLocaleString()} commits (
                  {((result.commitCount / status.data.totalCommits) * 100).toFixed(1)}
                  %). The estimate reflects only recent activity, not the full
                  repository history.
                </Flash>
              )}

              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "border.default",
                  borderRadius: 2,
                  p: [3, 4],
                  mb: 2,
                }}
              >
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems={["flex-start", "center"]}
                  flexWrap="wrap"
                  sx={{ gap: 2, mb: 2 }}
                >
                  <Text
                    size="small"
                    sx={{
                      fontWeight: 600,
                      color: "fg.muted",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Estimated development time
                  </Text>
                  <Box display="flex" sx={{ gap: 2 }}>
                    <Button
                      size="small"
                      leadingVisual={copied === "link" ? CheckIcon : LinkIcon}
                      onClick={() => copyShare("link")}
                    >
                      {copied === "link" ? "Copied" : "Copy link"}
                    </Button>
                    <Button
                      size="small"
                      leadingVisual={copied === "badge" ? CheckIcon : LinkIcon}
                      onClick={() => copyShare("badge")}
                    >
                      {copied === "badge" ? "Copied" : "Copy badge"}
                    </Button>
                  </Box>
                </Box>
                <Box display="flex" alignItems="baseline" sx={{ gap: 3, flexWrap: "wrap" }}>
                  <Text as="h2" sx={{ fontSize: [5, 6], fontWeight: 600, lineHeight: 1.1 }}>
                    {formatHours(result.totalMinutes)}
                  </Text>
                  <Text color="fg.muted">
                    ≈ {(result.totalMinutes / 480).toFixed(0)} working days ·{" "}
                    {result.sessionCount.toLocaleString()} sessions
                  </Text>
                </Box>
                <Box
                  sx={{
                    mt: 3,
                    height: 8,
                    borderRadius: 8,
                    overflow: "hidden",
                    display: "flex",
                    bg: "var(--bgColor-neutral-muted)",
                  }}
                >
                  <Box
                    sx={{
                      width: `${(result.humanMinutes / result.totalMinutes) * 100}%`,
                      bg: "var(--fgColor-accent)",
                    }}
                  />
                  {result.agentMinutes > 0 && (
                    <Box
                      sx={{
                        width: `${(result.agentMinutes / result.totalMinutes) * 100}%`,
                        bg: "var(--fgColor-attention)",
                      }}
                    />
                  )}
                </Box>
                <Box display="flex" alignItems="center" sx={{ gap: 4, mt: 2, flexWrap: "wrap" }}>
                  <Text size="small">
                    <Box
                      as="span"
                      sx={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bg: "var(--fgColor-accent)",
                        mr: 1,
                      }}
                    />
                    {formatHours(result.humanMinutes)} human-driven (
                    {Math.round((result.humanMinutes / result.totalMinutes) * 100)}%)
                  </Text>
                  {result.agentMinutes > 0 && (
                    <Text size="small">
                      <Box
                        as="span"
                        sx={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bg: "var(--fgColor-attention)",
                          mr: 1,
                        }}
                      />
                      {formatHours(result.agentMinutes)} agent-authored (
                      {Math.round((result.agentMinutes / result.totalMinutes) * 100)}%)
                    </Text>
                  )}
                  {result.assistedCommitCount > 0 && (
                    <Text size="small" color="fg.muted">
                      + {result.assistedCommitCount.toLocaleString()} commits AI-assisted
                    </Text>
                  )}
                </Box>
              </Box>
              <Text as="p" size="small" color="fg.muted" sx={{ mt: 1, mb: 3 }}>
                {status.data.repo.fullName} · created{" "}
                {new Date(status.data.repo.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}{" "}
                · active {result.firstCommit.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}{" "}
                →{" "}
                {result.lastCommit.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}
              </Text>

              <StatGrid>
                <StatCard
                  stat={{
                    value: formatHours(result.totalMinutes / Math.max(1, result.sessionCount)),
                    label: "avg session length",
                  }}
                />
                <StatCard
                  stat={{
                    value: stats.activeDays.toLocaleString(),
                    label: "days with commits",
                    hint: `of ${stats.spanDays.toLocaleString()} days total`,
                  }}
                />
                <StatCard
                  stat={{
                    value: (result.commitCount / Math.max(1, stats.activeDays)).toFixed(1),
                    label: "commits per active day",
                  }}
                />
                <StatCard
                  stat={{
                    value: `${stats.longestStreakDays}d`,
                    label: "longest daily streak",
                  }}
                />
                <StatCard
                  stat={{
                    value: stats.busiestDay ? String(stats.busiestDay.commits) : "0",
                    label: "busiest day",
                    hint: stats.busiestDay?.date,
                  }}
                />
                <StatCard
                  stat={{
                    value: `${Math.round(stats.nightShare * 100)}%`,
                    label: "commits 22:00–06:00",
                    hint: stats.nightShare > 0.25 ? "night owl" : "day worker",
                  }}
                />
                <StatCard
                  stat={{
                    value: `${Math.round(stats.weekendShare * 100)}%`,
                    label: "weekend commits",
                  }}
                />
                <StatCard
                  stat={{
                    value:
                      stats.longestGapHours < 48
                        ? `${Math.round(stats.longestGapHours)} h`
                        : `${Math.round(stats.longestGapHours / 24)} d`,
                    label: "longest commit gap",
                  }}
                />
                {stats.loc && (
                  <>
                    <StatCard
                      stat={{
                        value: `+${stats.loc.adds.toLocaleString()} −${stats.loc.dels.toLocaleString()}`,
                        label: "lines changed",
                        hint:
                          stats.loc.enriched < result.commitCount
                            ? `for latest ${stats.loc.enriched.toLocaleString()} commits`
                            : undefined,
                      }}
                    />
                    <StatCard
                      stat={{
                        value: `±${stats.loc.perCommitMedian}`,
                        label: "median commit size",
                        hint: `${stats.loc.perCommitMean} mean · ${stats.loc.bulk} bulk`,
                      }}
                    />
                  </>
                )}
              </StatGrid>

              <Section title="Contribution activity">
                <Heatmap stats={stats} />
              </Section>

              <Box
                display="grid"
                sx={{ gridTemplateColumns: ["minmax(0, 1fr)", "1fr 1fr"], gap: 3, mt: 4 }}
              >
                <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: [2, 3], minWidth: 0 }}>
                  <Histogram title="Commits by weekday" values={stats.weekday} labels={WEEKDAY} />
                </Box>
                <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2, p: [2, 3], minWidth: 0 }}>
                  <Histogram title="Commits by hour (local)" values={stats.hour} labels={HOURS} labelEvery={4} />
                </Box>
              </Box>

              {status.data.codeFreq && status.data.codeFreq.length > 0 && (
                <Section title={undefined}>
                  <LocChart weeks={status.data.codeFreq} />
                </Section>
              )}

              {Object.keys(status.data.languages).length > 0 && (
                <Section title={undefined}>
                  <LanguageBar languages={status.data.languages} />
                </Section>
              )}

              <Section title="Sessions per month">
                <Timeline sessions={result.sessions} />
              </Section>

              <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
                Authors
                <CounterLabel sx={{ ml: 2 }}>{result.authors.length}</CounterLabel>
              </Heading>
              <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
                {result.authors.slice(0, 12).map((a, i) => {
                  const share = a.minutes / Math.max(1, result.authors[0].minutes);
                  return (
                    <Box
                      key={a.author}
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      px={3}
                      py={2}
                      sx={{
                        borderTop: i === 0 ? "none" : "1px solid",
                        borderColor: "border.muted",
                      }}
                    >
                      <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0, flex: 1 }}>
                        {a.avatar ? (
                          <Box
                            as="img"
                            src={a.avatar}
                            alt=""
                            sx={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0 }}
                          />
                        ) : (
                          <PersonIcon size={14} />
                        )}
                        {a.avatar ? (
                          <Link
                            href={`https://github.com/${a.author}`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", color: "fg.default" }}
                          >
                            {a.author}
                          </Link>
                        ) : (
                          <Text sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.author}
                          </Text>
                        )}
                        {a.agent && <Label size="small">AI</Label>}
                      </Box>
                      <Box sx={{ width: 96, mx: 3, bg: "var(--bgColor-neutral-muted)", borderRadius: 4, height: 6, overflow: "hidden", display: ["none", "block"] }}>
                        <Box sx={{ width: `${Math.round(share * 100)}%`, height: "100%", bg: a.agent ? "var(--fgColor-attention)" : "var(--fgColor-accent)" }} />
                      </Box>
                      <Box display="flex" alignItems="center" sx={{ gap: 3, flexShrink: 0 }}>
                        <Text size="small" color="fg.muted" sx={{ display: ["none", "block"] }}>
                          {a.sessions.toLocaleString()} session{a.sessions === 1 ? "" : "s"} ·{" "}
                          {a.commits.toLocaleString()} commits
                        </Text>
                        <Text sx={{ fontWeight: 600, minWidth: 64, textAlign: "right" }}>
                          {formatHours(a.minutes)}
                        </Text>
                      </Box>
                    </Box>
                  );
                })}
                {result.authors.length > 12 && (
                  <Text as="p" size="small" color="fg.muted" sx={{ px: 3, py: 2, m: 0 }}>
                    + {result.authors.length - 12} more
                  </Text>
                )}
              </Box>

              <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
                Recent sessions
              </Heading>
              <SessionList sessions={result.sessions} />

              <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
                Recent commits
              </Heading>
              <CommitList commits={status.data.commits} />

              <Text as="p" size="small" color="fg.muted" sx={{ mt: 3 }}>
                Each author's commits separated by a {Number(gap) / 60} h gap form a session;
                each session is credited its span plus {credit} min of ramp-up — person-hours,
                so parallel work by different people counts separately. Sessions authored
                entirely by AI agents are credited at 5 min — the prompt and review time, not
                typing time. Author dates are used, not push dates.
                {stats?.loc
                  ? " Signed in — per-commit diff stats were fetched, so larger diffs extend the ramp-up credit (+1 min per 30 lines changed, capped at +60)."
                  : " Sign in to fetch per-commit diff stats — larger diffs then extend the ramp-up credit."}{" "}
                This is an estimate — commits can be squashed, rewritten, or made in bulk.
              </Text>
            </Box>
          )}
        </Box>
      </PageLayout.Content>

      <PageLayout.Footer divider="line">
        <Box display="flex" justifyContent="space-between" py={3} sx={{ flexWrap: "wrap", gap: 1, px: [3, 0] }}>
          <Text size="small" color="fg.muted">
            MIT-licensed · estimates run in your browser · not affiliated with
            GitHub, Inc.
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
