import { describe, expect, it } from "vitest";
import {
  aiSessionCreditMinutes,
  modelOutputSpeed,
  pickSessionModel,
} from "./models";

describe("modelOutputSpeed", () => {
  it("maps known model families", () => {
    expect(modelOutputSpeed("Claude Opus 5.5")).toBe(85);
    expect(modelOutputSpeed("Claude Sonnet 4.5")).toBe(109);
    expect(modelOutputSpeed("claude-haiku")).toBe(185);
    expect(modelOutputSpeed("GPT-6.1 Sol")).toBe(26);
  });

  it("falls back when unknown", () => {
    expect(modelOutputSpeed(undefined)).toBe(85);
    expect(modelOutputSpeed("totally-made-up-model")).toBe(85);
  });
});

describe("aiSessionCreditMinutes", () => {
  it("uses the flat fallback without stats", () => {
    expect(aiSessionCreditMinutes({ churn: 0, files: 0, hasStats: false })).toBe(5);
  });

  it("scales up with larger diffs", () => {
    const small = aiSessionCreditMinutes({
      churn: 20,
      files: 1,
      hasStats: true,
      model: "Claude Opus 5.5",
    });
    const large = aiSessionCreditMinutes({
      churn: 800,
      files: 12,
      hasStats: true,
      model: "Claude Opus 5.5",
    });
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(45);
  });

  it("is slower (higher credit) for slower models at the same churn", () => {
    const opus = aiSessionCreditMinutes({
      churn: 400,
      files: 5,
      hasStats: true,
      model: "Claude Opus 5.5",
    });
    const codex = aiSessionCreditMinutes({
      churn: 400,
      files: 5,
      hasStats: true,
      model: "GPT-6.1 Sol",
    });
    expect(codex).toBeGreaterThan(opus);
  });
});

describe("pickSessionModel", () => {
  it("returns the most frequent model", () => {
    expect(
      pickSessionModel(["Claude Opus 5.5", "Claude Sonnet 4", "Claude Opus 5.5"]),
    ).toBe("Claude Opus 5.5");
  });
});
