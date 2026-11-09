import { detectCommit } from "./agents";

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
}

export interface Session {
  start: Date;
  end: Date;
  commitCount: number;
  /** credited minutes: span + credit applied to this session's kind */
  minutes: number;
  /** every commit in the session was authored by an AI agent */
  agentOnly: boolean;
  /** the author whose commits make up this session */
  author?: string;
  /** total additions+deletions across the session's commits (when stats were fetched) */
  churn?: number;
}

export interface AuthorEstimate {
  author: string;
  commits: number;
  sessions: number;
  minutes: number;
  agent: boolean;
  avatar?: string;
}

export interface EstimateResult {
  totalMinutes: number;
  /** human-driven session minutes (includes mixed sessions — a human was steering) */
  humanMinutes: number;
  /** agent-only session minutes, credited at the agent rate */
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
  /** minutes credited to a fully agent-authored session (prompt + review time) */
  agentCreditMinutes?: number;
}

const DEFAULT_GAP = 120;
const DEFAULT_CREDIT = 30;
const DEFAULT_AGENT_CREDIT = 5;

interface Point {
  date: Date;
  agent: boolean;
  churn: number;
}

/** extra ramp-up minutes per 30 lines of churn, capped — bigger diffs took longer */
const CHURN_PER_MIN = 30;
const CHURN_BONUS_CAP = 60;

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

  const flush = () => {
    if (!start || !prev) return;
    const span = (prev.getTime() - start.getTime()) / 60000;
    const credit = allAgent
      ? agentCreditMin
      : creditMin + Math.min(CHURN_BONUS_CAP, churn / CHURN_PER_MIN);
    sessions.push({
      start,
      end: prev,
      commitCount: count,
      minutes: span + credit,
      agentOnly: allAgent,
      churn: churn || undefined,
    });
    churn = 0;
  };

  for (const p of points) {
    if (prev && p.date.getTime() - prev.getTime() > gapMin * 60000) {
      flush();
      start = null;
      count = 0;
      allAgent = true;
    }
    if (!start) start = p.date;
    if (!p.agent) allAgent = false;
    prev = p.date;
    count++;
    churn += p.churn;
  }
  flush();
  return sessions;
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
      return {
        ...c,
        date: new Date(c.authorDate),
        /** only bot-authored commits rate the cheaper agent session */
        agent: authored,
        assisted: signal?.strength === "assisted",
        botAuthor: authored && signal?.via === "author",
        /** identity behind the work: the bot committer for automation, else the author */
        identity:
          authored && signal?.via === "committer"
            ? c.committer || c.author || "unknown"
            : c.author || "unknown",
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
    entry.dates.push({
      date: c.date,
      agent: c.agent,
      // assisted diffs are mostly machine-written — review time counts at half weight
      churn: ((c.additions ?? 0) + (c.deletions ?? 0)) * (c.assisted ? 0.5 : 1),
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
    authors.push({ author, commits, sessions: ss.length, agent, avatar, minutes });
  }
  authors.sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes: humanMinutes + agentMinutes,
    humanMinutes,
    agentMinutes,
    commitCount: dated.length,
    agentCommitCount: dated.filter((c) => c.agent).length,
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
