/**
 * Output speeds for AI session credit.
 * Agent harness medians (Claude Code / Codex) preferred over raw API where known.
 * Sources: Tecyfy Claude Code/Codex logs (2026-10→11), Artificial Analysis via llm.ing.
 */

/** Fallback when the commit has no model string — Claude Code Opus-ish median */
export const DEFAULT_OUTPUT_TOK_S = 85;

/** Rough tokens an agent emits per line of additions+deletions */
export const TOKENS_PER_LINE = 30;

/** Multi-turn tool loops vs pure streaming */
export const AI_TOOL_OVERHEAD = 1.5;

/** Human glances at the diff before committing */
export const AI_REVIEW_MINUTES = 2;
export const AI_REVIEW_PER_FILE = 0.15;

/** Cap so one AI session doesn't claim an hour of "generation" alone */
export const AI_CREDIT_CAP_MINUTES = 45;

const SPEEDS: Array<{ match: RegExp; tokPerSec: number }> = [
  { match: /haiku/i, tokPerSec: 185 },
  { match: /sonnet/i, tokPerSec: 109 },
  { match: /opus/i, tokPerSec: 85 },
  { match: /claude/i, tokPerSec: 85 },
  { match: /codex|gpt-?6\.?1\s*sol|gpt-?5\.?[123].*codex/i, tokPerSec: 26 },
  { match: /luna/i, tokPerSec: 64 },
  { match: /gpt|o\d|chatgpt/i, tokPerSec: 90 },
  { match: /gemini.*flash|flash[- ]?lite/i, tokPerSec: 200 },
  { match: /gemini/i, tokPerSec: 116 },
  { match: /copilot/i, tokPerSec: 100 },
  { match: /cursor/i, tokPerSec: 100 },
  { match: /devin/i, tokPerSec: 80 },
  { match: /aider/i, tokPerSec: 80 },
];

/** Tokens per second for a model name from a commit trailer */
export function modelOutputSpeed(model?: string | null): number {
  if (!model?.trim()) return DEFAULT_OUTPUT_TOK_S;
  for (const row of SPEEDS) {
    if (row.match.test(model)) return row.tokPerSec;
  }
  return DEFAULT_OUTPUT_TOK_S;
}

/** Most common non-empty model string in a session */
export function pickSessionModel(models: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const m of models) {
    const key = m?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | undefined;
  let n = 0;
  for (const [k, c] of counts) {
    if (c > n) {
      best = k;
      n = c;
    }
  }
  return best;
}

/**
 * AI session ramp-up: generation time from diff size ÷ model speed,
 * plus a small review buffer. Without diff stats, use `fallbackMinutes`.
 */
export function aiSessionCreditMinutes({
  churn,
  files,
  hasStats,
  model,
  fallbackMinutes = 5,
}: {
  churn: number;
  files: number;
  hasStats: boolean;
  model?: string;
  fallbackMinutes?: number;
}): number {
  if (!hasStats || churn <= 0) return fallbackMinutes;
  const tokS = modelOutputSpeed(model);
  const tokens = Math.max(0, churn) * TOKENS_PER_LINE;
  const genMin = (tokens / tokS / 60) * AI_TOOL_OVERHEAD;
  const review = AI_REVIEW_MINUTES + Math.min(Math.max(0, files), 40) * AI_REVIEW_PER_FILE;
  const credit = genMin + review;
  return Math.min(AI_CREDIT_CAP_MINUTES, Math.max(fallbackMinutes * 0.5, credit));
}
