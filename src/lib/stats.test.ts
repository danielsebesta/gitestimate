import { describe, expect, it } from "vitest";
import type { CommitSample } from "./estimate";
import { computeStats, dayKey, levelFor } from "./stats";

const neverAgent = () => false;

/** Build an ISO timestamp at local noon on Y-M-D so day/weekday assertions are TZ-stable. */
function localNoon(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

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
    expect(levelFor(1, 100)).toBe(1);
    expect(levelFor(25, 100)).toBe(1);
    expect(levelFor(26, 100)).toBe(2);
    expect(levelFor(50, 100)).toBe(2);
    expect(levelFor(51, 100)).toBe(3);
    expect(levelFor(75, 100)).toBe(3);
    expect(levelFor(76, 100)).toBe(4);
    expect(levelFor(100, 100)).toBe(4);
  });
});

describe("dayKey", () => {
  it("formats the viewer's local calendar day", () => {
    const d = new Date(2024, 5, 1, 15, 30, 0); // Jun 1 local
    expect(dayKey(d)).toBe("2024-06-01");
  });
});

describe("computeStats day counting", () => {
  it("buckets commits by local calendar day", () => {
    const d1 = localNoon(2024, 6, 1);
    const d1b = new Date(2024, 5, 1, 18, 0, 0).toISOString();
    const d2 = localNoon(2024, 6, 2);
    const stats = computeStats([c(d1), c(d1b), c(d2)], neverAgent);
    expect(stats.activeDays).toBe(2);
    expect(stats.days.get("2024-06-01")?.commits).toBe(2);
    expect(stats.days.get("2024-06-02")?.commits).toBe(1);
    expect(stats.busiestDay).toEqual({ date: "2024-06-01", commits: 2 });
  });

  it("counts ISO weekdays in local time (0=Mon..6=Sun)", () => {
    // Pick known local weekdays via Date(y,m,d)
    const mon = localNoon(2024, 6, 3); // 2024-06-03 is Monday
    const sat = localNoon(2024, 6, 8);
    const sun = localNoon(2024, 6, 9);
    expect(new Date(mon).getDay()).toBe(1);
    expect(new Date(sat).getDay()).toBe(6);
    expect(new Date(sun).getDay()).toBe(0);

    const stats = computeStats([c(mon), c(sat), c(sun)], neverAgent);
    expect(stats.weekday[0]).toBe(1); // Mon
    expect(stats.weekday[5]).toBe(1); // Sat
    expect(stats.weekday[6]).toBe(1); // Sun
    expect(stats.weekendShare).toBeCloseTo(2 / 3);
  });

  it("computes longest streak of consecutive active local days", () => {
    const stats = computeStats(
      [
        c(localNoon(2024, 1, 1)),
        c(localNoon(2024, 1, 2)),
        c(localNoon(2024, 1, 3)),
        c(localNoon(2024, 1, 5)),
      ],
      neverAgent,
    );
    expect(stats.longestStreakDays).toBe(3);
    expect(stats.spanDays).toBe(4);
    expect(stats.longestGapHours).toBe(48);
  });

  it("tracks agent commits per day via isAgent", () => {
    const day = localNoon(2024, 1, 1);
    const later = new Date(2024, 0, 1, 13, 0, 0).toISOString();
    const stats = computeStats(
      [c(day, "bot"), c(later, "alice")],
      (x) => x.author === "bot",
    );
    expect(stats.days.get("2024-01-01")).toEqual({
      date: "2024-01-01",
      commits: 2,
      agentCommits: 1,
    });
  });
});
