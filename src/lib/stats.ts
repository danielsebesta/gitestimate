import type { CommitSample } from "./estimate";

export interface DayCell {
  /** YYYY-MM-DD in UTC */
  date: string;
  commits: number;
  agentCommits: number;
}

export interface RepoStats {
  /** per-day commit counts, UTC, only days with activity */
  days: Map<string, DayCell>;
  /** commits per ISO weekday 0=Mon..6=Sun */
  weekday: number[];
  /** commits per local hour 0..23 */
  hour: number[];
  longestStreakDays: number;
  busiestDay: { date: string; commits: number } | null;
  /** share of commits made 22:00–06:00 local */
  nightShare: number;
  weekendShare: number;
  activeDays: number;
  /** longest gap between consecutive commits, hours */
  longestGapHours: number;
  spanDays: number;
  /** diff-stat aggregates — present only when commits were GraphQL-enriched */
  loc?: {
    adds: number;
    dels: number;
    net: number;
    /** median additions+deletions per commit */
    perCommitMedian: number;
    perCommitMean: number;
    /** commits that carry diff stats */
    enriched: number;
    /** churn > 2000 — likely vendored/generated/squashed */
    bulk: number;
  };
}

const DAY_MS = 86400000;

export function computeStats(commits: CommitSample[], isAgent: (c: CommitSample) => boolean): RepoStats {
  const dates = commits
    .map((c) => ({ c, d: new Date(c.authorDate) }))
    .filter((x) => !Number.isNaN(x.d.getTime()))
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  const days = new Map<string, DayCell>();
  const weekday = new Array(7).fill(0);
  const hour = new Array(24).fill(0);
  let night = 0;
  let weekend = 0;
  let maxGap = 0;
  let prev: number | null = null;
  let busiest: { date: string; commits: number } | null = null;

  for (const { c, d } of dates) {
    const key = d.toISOString().slice(0, 10);
    const cell = days.get(key) ?? { date: key, commits: 0, agentCommits: 0 };
    cell.commits++;
    if (isAgent(c)) cell.agentCommits++;
    days.set(key, cell);
    if (!busiest || cell.commits > busiest.commits) busiest = { date: key, commits: cell.commits };

    const wd = (d.getUTCDay() + 6) % 7;
    weekday[wd]++;
    if (wd >= 5) weekend++;
    const h = d.getHours();
    hour[h]++;
    if (h >= 22 || h < 6) night++;
    if (prev !== null) maxGap = Math.max(maxGap, d.getTime() - prev);
    prev = d.getTime();
  }

  // longest streak of consecutive active days
  let streak = 0;
  let longest = 0;
  let lastDay = -Infinity;
  for (const key of [...days.keys()].sort()) {
    const t = new Date(key + "T00:00:00Z").getTime();
    streak = t - lastDay === DAY_MS ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    lastDay = t;
  }

  const n = dates.length || 1;
  const spanDays =
    dates.length >= 2
      ? Math.round((dates[dates.length - 1].d.getTime() - dates[0].d.getTime()) / DAY_MS)
      : 0;

  const enriched = commits.filter((c) => c.additions !== undefined);
  let loc: RepoStats["loc"];
  if (enriched.length) {
    const churns = enriched
      .map((c) => (c.additions ?? 0) + (c.deletions ?? 0))
      .sort((a, b) => a - b);
    const adds = enriched.reduce((s, c) => s + (c.additions ?? 0), 0);
    const dels = enriched.reduce((s, c) => s + (c.deletions ?? 0), 0);
    loc = {
      adds,
      dels,
      net: adds - dels,
      perCommitMedian: churns[Math.floor(churns.length / 2)],
      perCommitMean: Math.round(churns.reduce((a, b) => a + b, 0) / churns.length),
      enriched: enriched.length,
      bulk: churns.filter((x) => x > 2000).length,
    };
  }

  return {
    days,
    weekday,
    hour,
    longestStreakDays: longest,
    busiestDay: busiest,
    nightShare: night / n,
    weekendShare: weekend / n,
    activeDays: days.size,
    longestGapHours: maxGap / 3600000,
    spanDays,
    loc,
  };
}

/** quartiles for the GitHub-style contribution scale (GitHub uses a similar log-ish cut) */
export function levelFor(commits: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (commits === 0) return 0;
  if (max <= 4) return Math.min(4, commits) as 0 | 1 | 2 | 3 | 4;
  const q = commits / max;
  if (q <= 0.25) return 1;
  if (q <= 0.5) return 2;
  if (q <= 0.75) return 3;
  return 4;
}
