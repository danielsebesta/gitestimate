import { detectCommit, isBotLogin } from "./agents";
import { aiSessionCreditMinutes, pickSessionModel } from "./models";

export interface CommitSample {
  /** ISO-8601 author date — when the work was written, not when it was pushed */
  authorDate: string;
  author: string;
  authorAvatar?: string;
  authorEmail?: string;
  committer?: string;
  committerAvatar?: string;
  committerEmail?: string;
  message?: string;
  sha?: string;
  /** per-commit diff stats — populated only when a token enables GraphQL enrichment */
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  /** unified diff patch sample — used for comment-density AI heuristics */
  patch?: string;
}

export interface Session {
  start: Date;
  end: Date;
  commitCount: number;
  /** credited minutes: span + credit applied to this session's kind */
  minutes: number;
  /**
   * Every commit was AI-authored (bot identity) or AI-assisted with explicit
   * provenance (Co-Authored-By / Assisted-By / Generated-By / tool footers).
   * Credited at the short agent rate — Claude Code-style repos aren't human
   * person-hours just because the git author is a human login.
   */
  agentOnly: boolean;
  /** the author whose commits make up this session */
  author?: string;
  /** sha of the session's first commit — links the session back to GitHub */
  firstSha?: string;
  /** total additions+deletions across the session's commits (when stats were fetched) */
  churn?: number;
  /** files touched across the session (when GraphQL stats were fetched) */
  changedFiles?: number;
  /** true when per-commit diff stats were available to scale the ramp-up */
  sized?: boolean;
}

export interface AuthorEstimate {
  author: string;
  commits: number;
  sessions: number;
  minutes: number;
  /** AI coding agent (not CI / dependabot) */
  agent: boolean;
  /** GitHub App / automation login — show Bot badge, strip [bot] in UI */
  bot: boolean;
  avatar?: string;
}

export interface EstimateResult {
  totalMinutes: number;
  /** sessions with at least one clean human commit (no AI provenance) */
  humanMinutes: number;
  /** sessions that are fully AI-authored or AI-assisted — agent credit rate */
  agentMinutes: number;
  commitCount: number;
  agentCommitCount: number;
  /** commits authored by a human but signed by an AI co-author/trailer */
  assistedCommitCount: number;
  sessionCount: number;
  agentSessionCount: number;
  sessions: Session[];
  authors: AuthorEstimate[];
  firstCommit: Date;
  lastCommit: Date;
}

export interface EstimateOptions {
  /** gap in minutes between commits that splits two sessions */
  sessionGapMinutes?: number;
  /** minutes credited on top of every human session's commit span */
  sessionCreditMinutes?: number;
  /**
   * Fallback minutes for AI sessions without diff stats (or as a floor).
   * With stats, credit scales from diff size ÷ model output speed + review.
   */
  agentCreditMinutes?: number;
}

const DEFAULT_GAP = 120;
const DEFAULT_CREDIT = 30;
const DEFAULT_AGENT_CREDIT = 5;

interface Point {
  date: Date;
  agent: boolean;
  churn: number;
  files: number;
  /** additions/deletions were present on this commit (vs unknown / not enriched) */
  hasStats: boolean;
  sha?: string;
  /** model string from trailers when present */
  model?: string;
}

/** lines of churn (+ light file weight) that earn the full configured session credit */
const FULL_CREDIT_AT_LINES = 80;
/** floor for a sized tiny edit (open editor, change, commit) */
const MIN_SIZED_CREDIT = 2;
/** extra minutes per 30 lines beyond FULL_CREDIT_AT_LINES */
const CHURN_PER_MIN = 30;
const CHURN_BONUS_CAP = 60;
/** each touched file adds a little context-switch cost (kept small so typos stay tiny) */
const FILES_AS_LINES = 2;

/** Deterministic 0..1 from a seed — same input ⇒ same estimate across refreshes. */
export function unitNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Multiplicative jitter centered on 1. Averaging two hashes gives a slightly
 * "bell-ish" spread so totals look statistical instead of chalk-round (30+30+110).
 */
export function jitterFactor(seed: string, spread = 0.24): number {
  const a = unitNoise(seed);
  const b = unitNoise(`${seed}|b`);
  const centered = (a + b) / 2; // denser near 0.5
  return 1 + (centered * 2 - 1) * spread;
}

/**
 * Human ramp-up credit. Without diff stats, use the classic git-hours base
 * (then jitter). With stats, scale by churn + files so a 1-line typo is a few
 * minutes, not a flat +30. `seed` makes the noise reproducible.
 */
export function rampCreditMinutes(
  churn: number,
  files: number,
  hasStats: boolean,
  creditMin: number,
  agentOnly: boolean,
  agentCreditMin: number,
  seed = "",
  model?: string,
): number {
  let credit: number;
  if (agentOnly) {
    credit = aiSessionCreditMinutes({
      churn,
      files,
      hasStats,
      model,
      fallbackMinutes: agentCreditMin,
    });
  } else if (!hasStats) {
    credit = creditMin;
  } else {
    const effective = Math.max(0, churn) + Math.min(Math.max(0, files), 40) * FILES_AS_LINES;
    if (effective <= 0) credit = MIN_SIZED_CREDIT;
    else {
      const scale = Math.min(1, effective / FULL_CREDIT_AT_LINES);
      const base = MIN_SIZED_CREDIT + (creditMin - MIN_SIZED_CREDIT) * scale;
      const overflow = Math.max(0, effective - FULL_CREDIT_AT_LINES);
      const bonus = Math.min(CHURN_BONUS_CAP, overflow / CHURN_PER_MIN);
      credit = base + bonus;
    }
  }

  if (seed) {
    const spread = agentOnly ? 0.12 : 0.24;
    credit *= jitterFactor(seed, spread);
    if (!agentOnly) credit += (unitNoise(`${seed}|abs`) - 0.5) * 5;
  }

  const floor = agentOnly ? Math.max(1, agentCreditMin * 0.5) : MIN_SIZED_CREDIT * 0.5;
  return Math.max(floor, credit);
}

function sessionsFor(
  points: Point[],
  gapMin: number,
  creditMin: number,
  agentCreditMin: number,
): Session[] {
  const sessions: Session[] = [];
  let start: Date | null = null;
  let prev: Date | null = null;
  let count = 0;
  let allAgent = true;
  let churn = 0;
  let files = 0;
  let hasStats = false;
  let firstSha: string | undefined;
  const models: Array<string | undefined> = [];

  const flush = () => {
    if (!start || !prev) return;
    const span = (prev.getTime() - start.getTime()) / 60000;
    const model = pickSessionModel(models);
    const seed = [
      firstSha ?? "",
      start.toISOString(),
      String(count),
      String(Math.round(churn)),
      String(files),
      model ?? "",
    ].join(":");
    const credit = rampCreditMinutes(
      churn,
      files,
      hasStats,
      creditMin,
      allAgent,
      agentCreditMin,
      seed,
      model,
    );
    const minutes = Math.round((span + credit) * 10) / 10;
    sessions.push({
      start,
      end: prev,
      commitCount: count,
      minutes,
      agentOnly: allAgent,
      firstSha,
      churn: hasStats ? churn : undefined,
      changedFiles: hasStats ? files : undefined,
      sized: hasStats,
    });
    churn = 0;
    files = 0;
    hasStats = false;
    firstSha = undefined;
    models.length = 0;
  };

  for (const p of points) {
    if (prev && p.date.getTime() - prev.getTime() > gapMin * 60000) {
      flush();
      start = null;
      count = 0;
      allAgent = true;
    }
    if (!start) {
      start = p.date;
      firstSha = p.sha;
    }
    if (!p.agent) allAgent = false;
    prev = p.date;
    count++;
    churn += p.churn;
    files += p.files;
    if (p.hasStats) hasStats = true;
    models.push(p.model);
  }
  flush();
  return sessions;
}

/**
 * Identity behind a commit's work: the bot committer for automation,
 * else the author. Shared by estimate() and the author filter in the UI.
 */
export function authorIdentity(c: CommitSample): string {
  const signal = detectCommit(c);
  return signal?.strength === "authored" && signal.via === "committer"
    ? c.committer || c.author || "unknown"
    : c.author || "unknown";
}

export function estimate(
  commits: CommitSample[],
  {
    sessionGapMinutes = DEFAULT_GAP,
    sessionCreditMinutes = DEFAULT_CREDIT,
    agentCreditMinutes = DEFAULT_AGENT_CREDIT,
  }: EstimateOptions = {},
): EstimateResult | null {
  const dated = commits
    .map((c) => {
      const signal = detectCommit(c);
      const authored = signal?.strength === "authored";
      const assisted = signal?.strength === "assisted";
      return {
        ...c,
        date: new Date(c.authorDate),
        authored,
        assisted,
        /**
         * Counts toward the AI session rate. Bot identities, trailers,
         * and any heuristic signal that detectCommit promotes to assisted.
         */
        agent: authored || assisted,
        model: signal?.model,
        identity: authorIdentity(c),
      };
    })
    .filter((c) => !Number.isNaN(c.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (dated.length === 0) return null;

  const byAuthor = new Map<
    string,
    { commits: number; dates: Point[]; agent: boolean; avatar?: string }
  >();
  for (const c of dated) {
    const key = c.identity;
    const entry = byAuthor.get(key) ?? { commits: 0, dates: [], agent: true };
    entry.commits++;
    const hasStats = c.additions !== undefined || c.deletions !== undefined;
    entry.dates.push({
      date: c.date,
      agent: c.agent,
      sha: c.sha,
      hasStats,
      churn: hasStats ? (c.additions ?? 0) + (c.deletions ?? 0) : 0,
      files: hasStats ? (c.changedFiles ?? 1) : 0,
      model: c.model,
    });
    if (!c.agent) entry.agent = false;
    if (!entry.avatar)
      entry.avatar =
        c.identity === (c.author || "unknown") ? c.authorAvatar : c.committerAvatar;
    byAuthor.set(key, entry);
  }

  // sessions are per-author — person-hours. Two people committing in the same
  // evening count as two sessions, not one shared span.
  const sessions: Session[] = [];
  const authors: AuthorEstimate[] = [];
  let humanMinutes = 0;
  let agentMinutes = 0;
  let agentSessionCount = 0;
  for (const [author, { commits, dates, agent, avatar }] of byAuthor) {
    const ss = sessionsFor(dates, sessionGapMinutes, sessionCreditMinutes, agentCreditMinutes);
    let minutes = 0;
    for (const s of ss) {
      s.author = author;
      sessions.push(s);
      minutes += s.minutes;
      if (s.agentOnly) {
        agentMinutes += s.minutes;
        agentSessionCount++;
      } else {
        humanMinutes += s.minutes;
      }
    }
    authors.push({
      author,
      commits,
      sessions: ss.length,
      agent,
      bot: isBotLogin(author),
      avatar,
      minutes,
    });
  }
  authors.sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes: humanMinutes + agentMinutes,
    humanMinutes,
    agentMinutes,
    commitCount: dated.length,
    agentCommitCount: dated.filter((c) => c.authored).length,
    assistedCommitCount: dated.filter((c) => c.assisted).length,
    sessionCount: sessions.length,
    agentSessionCount,
    sessions,
    authors,
    firstCommit: dated[0].date,
    lastCommit: dated[dated.length - 1].date,
  };
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 100) return `${Math.round(hours).toLocaleString()} h`;
  if (hours >= 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(minutes)} min`;
}
