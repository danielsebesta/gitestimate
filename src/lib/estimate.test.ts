import { describe, expect, it } from "vitest";
import {
  estimate,
  formatHours,
  jitterFactor,
  rampCreditMinutes,
  unitNoise,
  type CommitSample,
} from "./estimate";

function commit(
  overrides: Partial<CommitSample> & Pick<CommitSample, "authorDate" | "author">,
): CommitSample {
  return overrides;
}

describe("formatHours", () => {
  it("shows minutes below 10 hours", () => {
    expect(formatHours(45)).toBe("45 min");
    expect(formatHours(599)).toBe("599 min");
  });

  it("shows one decimal for 10–99 hours", () => {
    expect(formatHours(600)).toBe("10.0 h");
    expect(formatHours(90 * 60)).toBe("90.0 h");
  });

  it("rounds whole hours at 100+", () => {
    expect(formatHours(100 * 60)).toMatch(/^100(\.0)? h$|^100 h$/);
    expect(formatHours(1234 * 60)).toContain("h");
    expect(formatHours(1234 * 60).replace(/[^\d]/g, "")).toContain("1234");
  });
});

describe("unitNoise / jitterFactor", () => {
  it("is deterministic for the same seed", () => {
    expect(unitNoise("abc")).toBe(unitNoise("abc"));
    expect(jitterFactor("abc")).toBe(jitterFactor("abc"));
  });

  it("varies across seeds and stays near 1", () => {
    const factors = ["a", "b", "c", "d", "e"].map((s) => jitterFactor(s, 0.24));
    expect(new Set(factors.map((f) => f.toFixed(4))).size).toBeGreaterThan(1);
    for (const f of factors) {
      expect(f).toBeGreaterThan(0.75);
      expect(f).toBeLessThan(1.25);
    }
  });
});

describe("rampCreditMinutes", () => {
  it("uses flat credit when stats are missing (pre-jitter)", () => {
    expect(rampCreditMinutes(0, 0, false, 30, false, 5, "")).toBe(30);
  });

  it("sizes AI sessions from diff speed instead of a flat 5 minutes", () => {
    const small = rampCreditMinutes(20, 1, true, 30, true, 5, "", "Claude Opus 5.5");
    const large = rampCreditMinutes(800, 10, true, 30, true, 5, "", "Claude Opus 5.5");
    expect(small).toBeGreaterThan(2);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(45);
    const j = rampCreditMinutes(100, 2, true, 30, true, 5, "agent-seed", "Claude Opus 5.5");
    expect(j).toBeGreaterThan(2);
    expect(j).toBeLessThan(30);
  });

  it("gives tiny diffs far less than the configured credit", () => {
    const typo = rampCreditMinutes(1, 1, true, 30, false, 5, "");
    expect(typo).toBeLessThan(8);
    expect(typo).toBeGreaterThanOrEqual(2);
  });

  it("approaches full credit around ~80 effective lines", () => {
    const mid = rampCreditMinutes(80, 0, true, 30, false, 5, "");
    expect(mid).toBeCloseTo(30, 0);
  });

  it("adds a capped bonus for very large churn", () => {
    const huge = rampCreditMinutes(10000, 0, true, 30, false, 5, "");
    expect(huge).toBe(30 + 60);
  });

  it("jitters so identical bases do not always equal creditMin", () => {
    const a = rampCreditMinutes(0, 0, false, 30, false, 5, "session-a");
    const b = rampCreditMinutes(0, 0, false, 30, false, 5, "session-b");
    expect(a).not.toBe(30);
    expect(b).not.toBe(a);
  });
});

describe("estimate sessions and gaps", () => {
  it("returns null for empty or undated commits", () => {
    expect(estimate([])).toBeNull();
    expect(estimate([commit({ authorDate: "not-a-date", author: "a" })])).toBeNull();
  });

  it("credits a lone unsized human commit near the default (with noise)", () => {
    const r = estimate([
      commit({ authorDate: "2024-01-01T12:00:00Z", author: "alice", sha: "aaa" }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.sessionCount).toBe(1);
    expect(r!.humanMinutes).toBeGreaterThan(20);
    expect(r!.humanMinutes).toBeLessThan(40);
    expect(r!.agentMinutes).toBe(0);
    expect(r!.sessions[0].agentOnly).toBe(false);
    expect(r!.sessions[0].sized).toBeFalsy();
  });

  it("is stable across repeated estimate() calls", () => {
    const commits = [
      commit({ authorDate: "2024-01-01T12:00:00Z", author: "alice", sha: "deadbeef" }),
      commit({ authorDate: "2024-01-02T12:00:00Z", author: "alice", sha: "cafebabe" }),
    ];
    expect(estimate(commits)!.totalMinutes).toBe(estimate(commits)!.totalMinutes);
  });

  it("does not give 30 min for a 1-line typo when stats exist", () => {
    const r = estimate([
      commit({
        authorDate: "2024-01-01T12:00:00Z",
        author: "alice",
        sha: "typo1",
        additions: 1,
        deletions: 0,
        changedFiles: 1,
      }),
    ]);
    expect(r!.sessions[0].minutes).toBeLessThan(10);
    expect(r!.sessions[0].sized).toBe(true);
    expect(r!.sessions[0].churn).toBe(1);
  });

  it("avoids chalk-round session rows for a series of lone commits", () => {
    const r = estimate([
      commit({ authorDate: "2024-01-01T12:00:00Z", author: "alice", sha: "s1" }),
      commit({ authorDate: "2024-01-03T12:00:00Z", author: "alice", sha: "s2" }),
      commit({ authorDate: "2024-01-05T12:00:00Z", author: "alice", sha: "s3" }),
    ]);
    const mins = r!.sessions.map((s) => s.minutes);
    // not all identical flat credits
    expect(new Set(mins.map((m) => Math.round(m))).size).toBeGreaterThan(1);
    // and not stuck on multiples of 5 for every row
    expect(mins.some((m) => Math.round(m) % 5 !== 0)).toBe(true);
  });

  it("splits sessions when gap exceeds sessionGapMinutes", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice", sha: "a1" }),
        commit({ authorDate: "2024-01-01T11:00:00Z", author: "alice", sha: "a2" }),
        commit({ authorDate: "2024-01-01T14:00:00Z", author: "alice", sha: "a3" }),
      ],
      { sessionGapMinutes: 120, sessionCreditMinutes: 30, agentCreditMinutes: 5 },
    );
    expect(r!.sessionCount).toBe(2);
    expect(r!.sessions[0].commitCount).toBe(2);
    expect(r!.sessions[1].commitCount).toBe(1);
    // first ≈ 60 span + ~30 credit
    expect(r!.sessions[0].minutes).toBeGreaterThan(70);
    expect(r!.sessions[0].minutes).toBeLessThan(110);
  });

  it("keeps commits within the gap in one session", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice", sha: "b1" }),
        commit({ authorDate: "2024-01-01T11:30:00Z", author: "alice", sha: "b2" }),
      ],
      { sessionGapMinutes: 120 },
    );
    expect(r!.sessionCount).toBe(1);
    expect(r!.sessions[0].minutes).toBeGreaterThan(90);
    expect(r!.sessions[0].minutes).toBeLessThan(140);
  });

  it("tracks per-author sessions separately", () => {
    const r = estimate([
      commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice", sha: "c1" }),
      commit({ authorDate: "2024-01-01T10:05:00Z", author: "bob", sha: "c2" }),
    ]);
    expect(r!.sessionCount).toBe(2);
    expect(r!.authors).toHaveLength(2);
    expect(r!.authors.map((a) => a.author).sort()).toEqual(["alice", "bob"]);
  });
});

describe("estimate agent credit", () => {
  it("credits fully agent-authored sessions near agentCreditMinutes", () => {
    const r = estimate(
      [
        commit({
          authorDate: "2024-01-01T10:00:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
          sha: "bot1",
        }),
        commit({
          authorDate: "2024-01-01T10:20:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
          sha: "bot2",
        }),
      ],
      { agentCreditMinutes: 5, sessionCreditMinutes: 30 },
    );
    expect(r!.agentCommitCount).toBe(2);
    expect(r!.agentSessionCount).toBe(1);
    expect(r!.sessions[0].agentOnly).toBe(true);
    // unsized AI session: span + ~5 fallback credit
    expect(r!.sessions[0].minutes).toBeGreaterThan(20);
    expect(r!.sessions[0].minutes).toBeLessThan(30);
    expect(r!.humanMinutes).toBe(0);
  });

  it("treats mixed human+agent sessions as separate identities", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice", sha: "h1" }),
        commit({
          authorDate: "2024-01-01T10:10:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
          sha: "h2",
        }),
      ],
      { sessionCreditMinutes: 30, agentCreditMinutes: 5 },
    );
    expect(r!.sessionCount).toBe(2);
    const human = r!.sessions.find((s) => !s.agentOnly)!;
    const agent = r!.sessions.find((s) => s.agentOnly)!;
    expect(human.minutes).toBeGreaterThan(20);
    expect(human.minutes).toBeLessThan(40);
    expect(agent.minutes).toBeGreaterThan(3);
    expect(agent.minutes).toBeLessThan(8);
  });

  it("credits fully AI-assisted sessions at AI rate, not human person-hours", () => {
    const r = estimate(
      [
        commit({
          authorDate: "2024-01-01T10:00:00Z",
          author: "alice",
          sha: "assist1",
          message: "feat: ship it\n\nCo-authored-by: Claude Opus 4 <noreply@anthropic.com>",
          additions: 40,
          deletions: 0,
          changedFiles: 1,
        }),
        commit({
          authorDate: "2024-01-01T10:20:00Z",
          author: "alice",
          sha: "assist2",
          message: "docs\n\nCo-authored-by: Claude Opus 4 <noreply@anthropic.com>",
          additions: 10,
          deletions: 0,
          changedFiles: 1,
        }),
      ],
      { agentCreditMinutes: 5, sessionCreditMinutes: 30 },
    );
    expect(r!.assistedCommitCount).toBe(2);
    expect(r!.agentCommitCount).toBe(0);
    expect(r!.sessions[0].agentOnly).toBe(true);
    // ~20m span + sized AI credit — far below a human ~50m session
    expect(r!.sessions[0].minutes).toBeGreaterThan(20);
    expect(r!.sessions[0].minutes).toBeLessThan(45);
    expect(r!.humanMinutes).toBe(0);
    expect(r!.agentMinutes).toBe(r!.totalMinutes);
  });

  it("keeps human credit when a session mixes clean human + assisted commits", () => {
    const r = estimate(
      [
        commit({
          authorDate: "2024-01-01T10:00:00Z",
          author: "alice",
          sha: "h1",
          message: "fix typo",
        }),
        commit({
          authorDate: "2024-01-01T10:10:00Z",
          author: "alice",
          sha: "a1",
          message: "feat\n\nCo-authored-by: Claude <noreply@anthropic.com>",
        }),
      ],
      { sessionCreditMinutes: 30, agentCreditMinutes: 5 },
    );
    expect(r!.sessions[0].agentOnly).toBe(false);
    expect(r!.sessions[0].minutes).toBeGreaterThan(20);
    expect(r!.humanMinutes).toBeGreaterThan(0);
  });

  it("caps churn bonus near 60 minutes on top of full credit", () => {
    const r = estimate([
      commit({
        authorDate: "2024-01-01T10:00:00Z",
        author: "alice",
        sha: "huge1",
        additions: 10000,
        deletions: 0,
        changedFiles: 1,
      }),
    ]);
    // 90 base ± jitter
    expect(r!.sessions[0].minutes).toBeGreaterThan(70);
    expect(r!.sessions[0].minutes).toBeLessThan(115);
  });
});
