import { describe, expect, it } from "vitest";
import type { CommitSample } from "./estimate";
import { computeStats, levelFor } from "./stats";

const neverAgent = () => false;

function c(authorDate: string, author = "alice"): CommitSample {
  return { authorDate, author };
}

describe("levelFor", () => {
  it("returns 0 for no commits", () => {
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(0, 0)).toBe(0);
  });

  it("uses absolute counts when max is small", () => {
    expect(levelFor(1, 4)).toBe(1);
    expect(levelFor(2, 3)).toBe(2);
    expect(levelFor(4, 4)).toBe(4);
    expect(levelFor(9, 4)).toBe(4);
  });

  it("uses quartile buckets when max > 4", () => {
    expect(levelFor(1, 100)).toBe(1); // 1%
    expect(levelFor(25, 100)).toBe(1); // 25%
    expect(levelFor(26, 100)).toBe(2);
    expect(levelFor(50, 100)).toBe(2);
    expect(levelFor(51, 100)).toBe(3);
    expect(levelFor(75, 100)).toBe(3);
    expect(levelFor(76, 100)).toBe(4);
    expect(levelFor(100, 100)).toBe(4);
  });
});

describe("computeStats day counting", () => {
  it("buckets commits by UTC calendar day", () => {
    const stats = computeStats(
      [
        c("2024-06-01T01:00:00Z"),
        c("2024-06-01T23:00:00Z"),
        c("2024-06-02T00:30:00Z"),
      ],
      neverAgent,
    );
    expect(stats.activeDays).toBe(2);
    expect(stats.days.get("2024-06-01")?.commits).toBe(2);
    expect(stats.days.get("2024-06-02")?.commits).toBe(1);
    expect(stats.busiestDay).toEqual({ date: "2024-06-01", commits: 2 });
  });

  it("counts ISO weekdays in UTC (0=Mon..6=Sun)", () => {
    // 2024-06-03 = Monday UTC, 2024-06-08 = Saturday UTC, 2024-06-09 = Sunday UTC
    const stats = computeStats(
      [c("2024-06-03T12:00:00Z"), c("2024-06-08T12:00:00Z"), c("2024-06-09T12:00:00Z")],
      neverAgent,
    );
    expect(stats.weekday[0]).toBe(1); // Mon
    expect(stats.weekday[5]).toBe(1); // Sat
    expect(stats.weekday[6]).toBe(1); // Sun
    expect(stats.weekendShare).toBeCloseTo(2 / 3);
  });

  it("computes longest streak of consecutive active UTC days", () => {
    const stats = computeStats(
      [
        c("2024-01-01T12:00:00Z"),
        c("2024-01-02T12:00:00Z"),
        c("2024-01-03T12:00:00Z"),
        // gap
        c("2024-01-05T12:00:00Z"),
      ],
      neverAgent,
    );
    expect(stats.longestStreakDays).toBe(3);
    expect(stats.spanDays).toBe(4);
    expect(stats.longestGapHours).toBe(48);
  });

  it("tracks agent commits per day via isAgent", () => {
    const stats = computeStats(
      [c("2024-01-01T12:00:00Z", "bot"), c("2024-01-01T13:00:00Z", "alice")],
      (x) => x.author === "bot",
    );
    expect(stats.days.get("2024-01-01")).toEqual({
      date: "2024-01-01",
      commits: 2,
      agentCommits: 1,
    });
  });
});
