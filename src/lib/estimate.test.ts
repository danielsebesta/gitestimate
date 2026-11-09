import { describe, expect, it } from "vitest";
import { estimate, formatHours, type CommitSample } from "./estimate";

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

describe("estimate sessions and gaps", () => {
  it("returns null for empty or undated commits", () => {
    expect(estimate([])).toBeNull();
    expect(estimate([commit({ authorDate: "not-a-date", author: "a" })])).toBeNull();
  });

  it("credits a lone human commit with default session credit", () => {
    const r = estimate([
      commit({ authorDate: "2024-01-01T12:00:00Z", author: "alice" }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.sessionCount).toBe(1);
    expect(r!.humanMinutes).toBe(30);
    expect(r!.agentMinutes).toBe(0);
    expect(r!.totalMinutes).toBe(30);
    expect(r!.sessions[0].agentOnly).toBe(false);
  });

  it("splits sessions when gap exceeds sessionGapMinutes", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice" }),
        commit({ authorDate: "2024-01-01T11:00:00Z", author: "alice" }),
        // 3h later > 120m gap
        commit({ authorDate: "2024-01-01T14:00:00Z", author: "alice" }),
      ],
      { sessionGapMinutes: 120, sessionCreditMinutes: 30, agentCreditMinutes: 5 },
    );
    expect(r!.sessionCount).toBe(2);
    // first session: 60m span + 30 credit
    expect(r!.sessions[0].minutes).toBe(90);
    expect(r!.sessions[0].commitCount).toBe(2);
    // second: 0 span + 30 credit
    expect(r!.sessions[1].minutes).toBe(30);
    expect(r!.sessions[1].commitCount).toBe(1);
  });

  it("keeps commits within the gap in one session", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice" }),
        commit({ authorDate: "2024-01-01T11:30:00Z", author: "alice" }),
      ],
      { sessionGapMinutes: 120 },
    );
    expect(r!.sessionCount).toBe(1);
    expect(r!.sessions[0].minutes).toBe(90 + 30);
  });

  it("tracks per-author sessions separately", () => {
    const r = estimate([
      commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice" }),
      commit({ authorDate: "2024-01-01T10:05:00Z", author: "bob" }),
    ]);
    expect(r!.sessionCount).toBe(2);
    expect(r!.authors).toHaveLength(2);
    expect(r!.authors.map((a) => a.author).sort()).toEqual(["alice", "bob"]);
  });
});

describe("estimate agent credit", () => {
  it("credits fully agent-authored sessions at agentCreditMinutes", () => {
    const r = estimate(
      [
        commit({
          authorDate: "2024-01-01T10:00:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
        }),
        commit({
          authorDate: "2024-01-01T10:20:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
        }),
      ],
      { agentCreditMinutes: 5, sessionCreditMinutes: 30 },
    );
    expect(r!.agentCommitCount).toBe(2);
    expect(r!.agentSessionCount).toBe(1);
    expect(r!.sessions[0].agentOnly).toBe(true);
    // 20m span + 5 agent credit
    expect(r!.sessions[0].minutes).toBe(25);
    expect(r!.agentMinutes).toBe(25);
    expect(r!.humanMinutes).toBe(0);
  });

  it("treats mixed human+agent sessions as human (default credit)", () => {
    const r = estimate(
      [
        commit({ authorDate: "2024-01-01T10:00:00Z", author: "alice" }),
        commit({
          authorDate: "2024-01-01T10:10:00Z",
          author: "copilot[bot]",
          authorEmail: "copilot@github.com",
        }),
      ],
      { sessionCreditMinutes: 30, agentCreditMinutes: 5 },
    );
    expect(r!.sessionCount).toBe(2); // different identities
    const human = r!.sessions.find((s) => !s.agentOnly)!;
    const agent = r!.sessions.find((s) => s.agentOnly)!;
    expect(human.minutes).toBe(30);
    expect(agent.minutes).toBe(5);
  });

  it("counts assisted commits and halves churn for credit bonus", () => {
    const r = estimate([
      commit({
        authorDate: "2024-01-01T10:00:00Z",
        author: "alice",
        message: "feat: ship it\n\nCo-authored-by: copilot[bot] <copilot@github.com>",
        additions: 300,
        deletions: 0,
      }),
    ]);
    expect(r!.assistedCommitCount).toBe(1);
    expect(r!.agentCommitCount).toBe(0);
    // churn 300 * 0.5 = 150 → bonus 150/30 = 5; minutes = 0 + 30 + 5
    expect(r!.sessions[0].minutes).toBe(35);
  });

  it("caps churn bonus at 60 minutes", () => {
    const r = estimate([
      commit({
        authorDate: "2024-01-01T10:00:00Z",
        author: "alice",
        additions: 10000,
        deletions: 0,
      }),
    ]);
    expect(r!.sessions[0].minutes).toBe(30 + 60);
  });
});
