import { useCallback, useMemo, useState } from "react";
import {
  ActionList,
  ActionMenu,
  Box,
  Button,
  CounterLabel,
  Flash,
  FormControl,
  Heading,
  Label,
  Select,
  Text,
} from "@primer/react";
import {
  CheckIcon,
  DownloadIcon,
  GitCommitIcon,
  HubotIcon,
  LinkIcon,
  PersonIcon,
  RepoForkedIcon,
  StarIcon,
} from "@primer/octicons-react";
import {
  authorIdentity,
  estimate,
  formatHours,
  type CommitSample,
  type EstimateResult,
} from "../lib/estimate";
import type { RepoInfo } from "../lib/github";
import { detectCommit, stripBotSuffix, summarizeAgents } from "../lib/agents";
import { computeStats } from "../lib/stats";
import { authorsCsv, downloadText, sessionsCsv } from "../lib/export";
import Timeline from "./Timeline";
import Heatmap from "./Heatmap";
import Histogram from "./Histogram";
import LocChart from "./LocChart";
import LanguageBar from "./LanguageBar";
import CommitList from "./CommitList";
import SessionList from "./SessionList";
import AuthorsList from "./AuthorsList";
import AgentsPanel from "./AgentsPanel";
import { StatGrid, StatCard } from "./StatGrid";

export interface DoneState {
  repo: RepoInfo;
  commits: CommitSample[];
  totalCommits: number;
  capped: boolean;
  aiFiles: string[];
  codeFreq: Array<[number, number, number]> | null;
  languages: Record<string, number>;
  /** branches of the repo — feeds the branch picker */
  branches: string[];
  /** branch/sha the commits were fetched for */
  branch: string;
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i));

/** GitHub-issue-label look: icon and text on one baseline, no stray offsets */
const badgeSx = {
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  lineHeight: 1,
  flexShrink: 0,
} as const;

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

export default function ResultsPanel({
  data,
  viewerLogin,
  onRerunBranch,
}: {
  data: DoneState;
  /** signed-in login for “You” badges on matching authors */
  viewerLogin?: string | null;
  /** re-run the estimate for a different branch */
  onRerunBranch?: (branch: string) => void;
}) {
  const [authorFilter, setAuthorFilter] = useState("all");
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);

  const allResult = useMemo(() => estimate(data.commits), [data.commits]);
  const filteredCommits = useMemo(
    () =>
      authorFilter === "all"
        ? data.commits
        : data.commits.filter((c) => authorIdentity(c) === authorFilter),
    [data.commits, authorFilter],
  );
  const result: EstimateResult | null = useMemo(
    () => estimate(filteredCommits) ?? allResult,
    [filteredCommits, allResult],
  );
  const stats = useMemo(
    () => computeStats(filteredCommits, (c) => detectCommit(c)?.strength === "authored"),
    [filteredCommits],
  );
  const agentUsage = useMemo(
    () => summarizeAgents(filteredCommits, { branch: data.branch }),
    [filteredCommits, data.branch],
  );
  const suspectedCount = useMemo(
    () =>
      filteredCommits.filter((c) => detectCommit(c, { branch: data.branch, patch: c.patch })?.strength === "suspected")
        .length,
    [filteredCommits, data.branch],
  );

  const copyShare = useCallback(
    async (kind: "link" | "badge") => {
      if (!result) return;
      const url = `${window.location.origin}/${data.repo.fullName}`;
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
    [data.repo.fullName, result],
  );

  const slug = data.repo.fullName.replace("/", "-");
  const exportJson = useCallback(() => {
    if (!result) return;
    downloadText(
      `gitestimate-${slug}.json`,
      JSON.stringify(
        {
          repo: data.repo.fullName,
          branch: data.branch,
          generatedAt: new Date().toISOString(),
          params: {
            author: authorFilter === "all" ? undefined : authorFilter,
          },
          totals: {
            minutes: Math.round(result.totalMinutes),
            humanMinutes: Math.round(result.humanMinutes),
            agentMinutes: Math.round(result.agentMinutes),
            commits: result.commitCount,
            agentCommits: result.agentCommitCount,
            assistedCommits: result.assistedCommitCount,
            sessions: result.sessionCount,
          },
          authors: result.authors,
          sessions: result.sessions.map((s) => ({
            ...s,
            start: s.start.toISOString(),
            end: s.end.toISOString(),
          })),
          commits: filteredCommits,
        },
        null,
        2,
      ),
      "application/json",
    );
  }, [data, filteredCommits, result, authorFilter, slug]);

  const exportSessions = useCallback(() => {
    if (result) downloadText(`gitestimate-${slug}-sessions.csv`, sessionsCsv(result.sessions), "text/csv");
  }, [result, slug]);

  const exportAuthors = useCallback(() => {
    if (result) downloadText(`gitestimate-${slug}-authors.csv`, authorsCsv(result.authors), "text/csv");
  }, [result, slug]);

  if (!result) return null;

  return (
    <Box sx={{ mt: 4 }}>
      {data.repo.description && (
        <Text as="p" color="fg.muted" sx={{ mb: 2 }}>
          {data.repo.description}
        </Text>
      )}
      <Box display="flex" alignItems="center" sx={{ gap: 2, mb: 3, flexWrap: "wrap" }}>
        {onRerunBranch && data.branches.length > 1 && (
          <FormControl sx={{ minWidth: 160 }}>
            <FormControl.Label visuallyHidden>Branch</FormControl.Label>
            <Select
              value={data.branch}
              onChange={(e) => onRerunBranch(e.currentTarget.value)}
              size="small"
              disabled={data.branches.length < 2}
            >
              {data.branches.map((b) => (
                <Select.Option key={b} value={b}>
                  {b}
                </Select.Option>
              ))}
            </Select>
          </FormControl>
        )}
        <Label variant="secondary" sx={badgeSx}>
          <GitCommitIcon size={12} /> {result.commitCount.toLocaleString()} commits
        </Label>
        <Label variant="secondary" sx={badgeSx}>
          <PersonIcon size={12} /> {result.authors.length}{" "}
          {result.authors.length === 1 ? "author" : "authors"}
        </Label>
        <Label variant="secondary" sx={badgeSx}>
          <StarIcon size={12} /> {data.repo.stars.toLocaleString()}
        </Label>
        <Label variant="secondary" sx={badgeSx}>
          <RepoForkedIcon size={12} /> {data.repo.forks.toLocaleString()}
        </Label>
        {data.repo.license && <Label variant="secondary">{data.repo.license}</Label>}
        {result.agentCommitCount > 0 && (
          <Label variant="secondary" sx={badgeSx}>
            <HubotIcon size={12} /> {result.agentCommitCount.toLocaleString()} AI author
          </Label>
        )}
        {result.assistedCommitCount > 0 && (
          <Label variant="secondary">
            {result.assistedCommitCount.toLocaleString()} AI helped
          </Label>
        )}
        {suspectedCount > 0 && (
          <Label variant="attention" title="Weak style signals — not proof">
            {suspectedCount.toLocaleString()} maybe AI
          </Label>
        )}
        {agentUsage.slice(0, 6).map((u) => (
          <Label key={u.toolId} variant="secondary" sx={badgeSx}>
            {u.avatarUrl ? (
              <Box
                as="img"
                src={u.avatarUrl}
                alt=""
                sx={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0 }}
              />
            ) : (
              <HubotIcon size={12} />
            )}
            {u.name}
            {u.models[0] ? ` · ${u.models[0]}` : ""}
          </Label>
        ))}
        {data.aiFiles.map((f) => (
          <Label key={f} variant="secondary">
            {f}
          </Label>
        ))}
      </Box>

      {data.capped && (
        <Flash variant="warning" sx={{ mb: 3 }}>
          Showing the latest {result.commitCount.toLocaleString()} of about{" "}
          {data.totalCommits.toLocaleString()} commits. Older history isn’t included.
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
            Estimated time
          </Text>
          <Box display="flex" alignItems="center" sx={{ gap: 2, flexWrap: "wrap" }}>
            {allResult && allResult.authors.length > 1 && (
              <FormControl sx={{ minWidth: 140 }}>
                <FormControl.Label visuallyHidden>Author</FormControl.Label>
                <Select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  size="small"
                  block
                >
                  <Select.Option value="all">All authors</Select.Option>
                  {allResult.authors.map((a) => (
                    <Select.Option key={a.author} value={a.author}>
                      {stripBotSuffix(a.author)}
                    </Select.Option>
                  ))}
                </Select>
              </FormControl>
            )}
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
            <ActionMenu>
              <ActionMenu.Button size="small" leadingVisual={DownloadIcon}>
                Export
              </ActionMenu.Button>
              <ActionMenu.Overlay>
                <ActionList>
                  <ActionList.Item onSelect={exportJson}>Estimate as JSON</ActionList.Item>
                  <ActionList.Item onSelect={exportSessions}>Sessions as CSV</ActionList.Item>
                  <ActionList.Item onSelect={exportAuthors}>Authors as CSV</ActionList.Item>
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          </Box>
        </Box>
        <Box display="flex" alignItems="baseline" sx={{ gap: 3, flexWrap: "wrap" }}>
          <Text as="h2" sx={{ fontSize: [5, 6], fontWeight: 600, lineHeight: 1.1 }}>
            {formatHours(result.totalMinutes)}
          </Text>
          <Text color="fg.muted">
            ≈ {(result.totalMinutes / 480).toFixed(0)} days ·{" "}
            {result.sessionCount.toLocaleString()} sessions
            {authorFilter !== "all" && ` · ${stripBotSuffix(authorFilter)}`}
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
            {formatHours(result.humanMinutes)} human (
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
              {formatHours(result.agentMinutes)} AI (
              {Math.round((result.agentMinutes / result.totalMinutes) * 100)}%)
            </Text>
          )}
          {result.assistedCommitCount > 0 && (
            <Text size="small" color="fg.muted">
              {result.assistedCommitCount.toLocaleString()} commits with AI trailers
            </Text>
          )}
        </Box>
      </Box>
      <Text as="p" size="small" color="fg.muted" sx={{ mt: 1, mb: 3 }}>
        {data.repo.fullName} · created{" "}
        {new Date(data.repo.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
        })}{" "}
        · active{" "}
        {result.firstCommit.toLocaleDateString(undefined, {
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
        <Box
          sx={{
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            p: [2, 3],
            minWidth: 0,
          }}
        >
          <Histogram title="Commits by weekday" values={stats.weekday} labels={WEEKDAY} />
        </Box>
        <Box
          sx={{
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            p: [2, 3],
            minWidth: 0,
          }}
        >
          <Histogram title="Commits by hour (local)" values={stats.hour} labels={HOURS} labelEvery={4} />
        </Box>
      </Box>

      {data.codeFreq && data.codeFreq.length > 0 && (
        <Section title={undefined}>
          <LocChart weeks={data.codeFreq} />
        </Section>
      )}

      {Object.keys(data.languages).length > 0 && (
        <Section title={undefined}>
          <LanguageBar languages={data.languages} />
        </Section>
      )}

      <Section title="Sessions per month">
        <Timeline sessions={result.sessions} />
      </Section>

      <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
        AI tools
        <CounterLabel sx={{ ml: 2 }}>{agentUsage.length}</CounterLabel>
      </Heading>
      <AgentsPanel usage={agentUsage} branch={data.branch} />

      <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
        Authors
        <CounterLabel sx={{ ml: 2 }}>{result.authors.length}</CounterLabel>
      </Heading>
      <AuthorsList
        authors={result.authors}
        commits={filteredCommits}
        viewerLogin={viewerLogin}
      />

      <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
        Recent sessions
      </Heading>
      <SessionList sessions={result.sessions} repoFullName={data.repo.fullName} />

      <Heading as="h3" sx={{ fontSize: 2, mt: 4, mb: 2 }}>
        Recent commits
      </Heading>
      <CommitList
        commits={filteredCommits}
        repoFullName={data.repo.fullName}
        branch={data.branch}
      />

      <Text as="p" size="small" color="fg.muted" sx={{ mt: 3 }}>
        Gaps over ~2 hours start a new session. Human time uses the commit span
        plus a sized ramp-up; AI sessions use model speed plus a short review.
        {stats.loc ? "" : " Sign in for better sizing."} Estimates only.
      </Text>
    </Box>
  );
}
