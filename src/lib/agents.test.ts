import { describe, expect, it } from "vitest";
import {
  analyzePatchCommentDensity,
  detectCommit,
  detectFiles,
  extractModel,
  isBotLogin,
  stripBotSuffix,
  summarizeAgents,
  toolAvatarUrl,
  resolveTool,
} from "./agents";

describe("detectCommit authored vs assisted", () => {
  it("returns null for ordinary human commits", () => {
    expect(
      detectCommit({
        author: "alice",
        authorEmail: "alice@example.com",
        message: "fix typo",
      }),
    ).toBeNull();
  });

  it("ignores CI and dependency bots (not AI agents)", () => {
    expect(
      detectCommit({
        author: "github-actions[bot]",
        authorEmail: "41898282+github-actions[bot]@users.noreply.github.com",
        message: "chore: bump workflow",
      }),
    ).toBeNull();
    expect(
      detectCommit({
        author: "dependabot[bot]",
        authorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
        message: "Bump lodash from 4.17.20 to 4.17.21",
      }),
    ).toBeNull();
    expect(
      detectCommit({
        author: "renovate[bot]",
        message: "Update dependency",
      }),
    ).toBeNull();
    expect(
      detectCommit({
        author: "pre-commit-ci[bot]",
        message: "[pre-commit.ci] auto fixes",
      }),
    ).toBeNull();
  });

  it("marks bot author identities as authored with tool metadata", () => {
    const s = detectCommit({
      author: "copilot[bot]",
      authorEmail: "copilot@github.com",
      message: "implement feature",
    });
    expect(s).toMatchObject({
      strength: "authored",
      via: "author",
      toolId: "copilot",
      tool: "GitHub Copilot",
    });
    expect(s!.avatarUrl).toMatch(/githubusercontent|github\.com/);
  });

  it("marks bot committer identities as authored via committer", () => {
    const s = detectCommit({
      author: "alice",
      authorEmail: "alice@example.com",
      committer: "cursor[bot]",
      committerEmail: "cursoragent@cursor.com",
      message: "apply patch",
    });
    expect(s).toMatchObject({ strength: "authored", via: "committer", toolId: "cursor" });
  });

  it("marks Co-authored-by AI trailers as assisted", () => {
    const s = detectCommit({
      author: "alice",
      message:
        "refactor\n\nCo-authored-by: Devin AI <devin-ai-integration[bot]@users.noreply.github.com>",
    });
    expect(s).toMatchObject({ strength: "assisted", via: "trailer", toolId: "devin" });
    expect(s!.marker).toMatch(/co-author/i);
  });

  it("parses Assisted-By / Generated-By with model names", () => {
    const assisted = detectCommit({
      author: "alice",
      message: "ship it\n\nAssisted-By: Claude Sonnet 4.5",
    });
    expect(assisted).toMatchObject({
      strength: "assisted",
      via: "trailer",
      toolId: "claude",
    });
    expect(assisted!.model).toMatch(/Claude/i);

    const generated = detectCommit({
      author: "alice",
      message: "wip\n\nGenerated-By: gpt-4o",
    });
    expect(generated).toMatchObject({ strength: "assisted", via: "trailer" });
    expect(generated!.model).toMatch(/gpt-4o/i);
  });

  it("marks message markers as assisted", () => {
    expect(
      detectCommit({
        author: "alice",
        message: "Generated with Claude Code",
      }),
    ).toMatchObject({ strength: "assisted", via: "trailer", toolId: "claude" });

    expect(
      detectCommit({
        author: "alice",
        message: "Made-with: Cursor",
      }),
    ).toMatchObject({ strength: "assisted", via: "trailer", toolId: "cursor" });
  });

  it("prefers authored author match over message trailers", () => {
    const s = detectCommit({
      author: "claude[bot]",
      authorEmail: "noreply@anthropic.com",
      message: "Generated with Claude Code",
    });
    expect(s).toMatchObject({ strength: "authored", via: "author", toolId: "claude" });
  });

  it("treats teaching-voice commit bodies as AI-assisted", () => {
    const s = detectCommit({
      author: "alice",
      message: [
        "Improve authentication flow",
        "",
        "This commit ensures that users can seamlessly authenticate.",
        "In order to improve the overall ability of the system, we leverage",
        "a comprehensive approach that facilitates robust session handling.",
        "",
        "Key changes:",
        "- Add token refresh",
        "- Update middleware",
        "- Document the new flow",
      ].join("\n"),
    });
    expect(s).toMatchObject({ strength: "assisted", via: "style" });
  });

  it("treats a single teaching-voice hit as assisted", () => {
    const s = detectCommit({
      author: "alice",
      message: "Fix login\n\nThis commit ensures that sessions expire correctly.\n\n- Update TTL",
    });
    expect(s).toMatchObject({ strength: "assisted", via: "style", marker: "teaching-voice" });
  });

  it("detects agent branch prefixes", () => {
    expect(
      detectCommit({ author: "alice", message: "wip" }, { branch: "codex/fix-login" }),
    ).toMatchObject({ strength: "assisted", via: "branch", toolId: "codex" });
    expect(
      detectCommit({ author: "alice", message: "wip" }, { branch: "ai/experiment" }),
    ).toMatchObject({ strength: "assisted", via: "branch" });
  });

  it("reads ODS-style AI-tool / AI-assisted trailers", () => {
    expect(
      detectCommit({ author: "alice", message: "feat\n\nAI-tool: Cursor" }),
    ).toMatchObject({ strength: "assisted", via: "trailer", toolId: "cursor" });
    expect(
      detectCommit({ author: "alice", message: "feat\n\nAI-assisted: true" }),
    ).toMatchObject({ strength: "assisted", via: "trailer" });
  });

  it("flags AI phrasing and robot-face codepoint in messages", () => {
    expect(
      detectCommit({ author: "alice", message: "refactor auth (AI-assisted)" }),
    ).toMatchObject({ strength: "assisted", via: "trailer" });
    expect(
      detectCommit({
        author: "alice",
        message: `${String.fromCodePoint(0x1f916)} auto cleanup`,
      }),
    ).toMatchObject({ strength: "assisted", via: "trailer" });
  });

  it("flags high comment-density patches as assisted", () => {
    const lines = [
      "@@ -1,3 +1,20 @@",
      "+// This function ensures that we correctly parse the input",
      "+// In order to improve readability we add thorough docs",
      "+// Note that this is important for maintainability",
      "+export function parse(x: string) {",
      "+  // Ensure the value is trimmed before use",
      "+  const v = x.trim();",
      "+  // Return the normalized result to callers",
      "+  return v;",
      "+}",
    ];
    while (lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length < 16) {
      lines.splice(1, 0, "+// explanatory documentation line for density");
    }
    const patch = lines.join("\n");
    const dens = analyzePatchCommentDensity(patch);
    expect(dens.density).toBeGreaterThanOrEqual(0.18);
    const s = detectCommit({ author: "alice", message: "docs" }, { patch });
    expect(s).toMatchObject({ strength: "assisted", via: "patch" });
  });

  it("flags generated-by comments inside patches", () => {
    const patch = [
      "@@ -1 +1,5 @@",
      "+// Generated by Claude Code — do not edit by hand",
      "+export const x = 1;",
      "+export const y = 2;",
      "+export const z = 3;",
    ].join("\n");
    expect(detectCommit({ author: "alice", message: "add consts" }, { patch })).toMatchObject({
      strength: "assisted",
      via: "patch",
      marker: expect.stringContaining("ai-comment-marker"),
    });
  });
});

describe("stripBotSuffix / isBotLogin", () => {
  it("strips [bot] for display", () => {
    expect(stripBotSuffix("github-actions[bot]")).toBe("github-actions");
    expect(stripBotSuffix("dependabot[bot]")).toBe("dependabot");
    expect(stripBotSuffix("alice")).toBe("alice");
  });

  it("flags CI and [bot] logins as bots", () => {
    expect(isBotLogin("github-actions[bot]")).toBe(true);
    expect(isBotLogin("dependabot[bot]")).toBe(true);
    expect(isBotLogin("alice")).toBe(false);
  });
});

describe("extractModel", () => {
  it("pulls model tokens from trailer values", () => {
    expect(extractModel("Claude Sonnet 4.5 <noreply@anthropic.com>")).toMatch(/Claude/i);
    expect(extractModel("gpt-4o")).toBe("gpt-4o");
  });
});

describe("toolAvatarUrl", () => {
  it("uses GitHub App /in/ avatar for Devin and Claude (not /u/ Identicons)", () => {
    const devin = resolveTool("devin-ai-integration[bot]")!;
    expect(toolAvatarUrl(devin)).toBe(
      "https://avatars.githubusercontent.com/in/811515?s=80&v=4",
    );
    const claude = resolveTool("claude[bot]")!;
    expect(toolAvatarUrl(claude)).toBe(
      "https://avatars.githubusercontent.com/in/1236702?s=80&v=4",
    );
  });

  it("prefers commit authorAvatar over catalog when authored", () => {
    const s = detectCommit({
      author: "devin-ai-integration[bot]",
      authorEmail: "158243242+devin-ai-integration[bot]@users.noreply.github.com",
      authorAvatar: "https://avatars.githubusercontent.com/in/811515?s=64&v=4",
      message: "ship",
    });
    expect(s!.avatarUrl).toBe("https://avatars.githubusercontent.com/in/811515?s=64&v=4");
  });
});

describe("summarizeAgents", () => {
  it("aggregates tools and models across commits", () => {
    const usage = summarizeAgents([
      {
        author: "copilot[bot]",
        authorEmail: "copilot@github.com",
        message: "bot commit",
      },
      {
        author: "alice",
        message: "feat\n\nAssisted-By: Claude Opus 4",
      },
    ]);
    expect(usage.map((u) => u.toolId)).toEqual(expect.arrayContaining(["copilot", "claude"]));
    const claude = usage.find((u) => u.toolId === "claude")!;
    expect(claude.assisted).toBe(1);
    expect(claude.models.some((m) => /Claude|Opus/i.test(m))).toBe(true);
  });

  it("resolves concrete brands from generic message patterns", () => {
    // "generated by <tool>" pattern has hint generic-bot, but the message
    // names the tool — the signal must land on the specific brand
    const s = detectCommit({
      author: "alice",
      message: "update deps\n\nGenerated with [Claude Code]",
    });
    expect(s).not.toBeNull();
    expect(s!.toolId).toBe("claude");
    expect(s!.tool).toBe("Claude");
  });

  it("resolves brands from AI-marker comments in patches", () => {
    const patch = [
      "diff --git a/app.ts b/app.ts",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,3 +1,8 @@",
      "+// Generated by Cursor",
      "+export const a = 1;",
      "+export const b = 2;",
      "+export const c = 3;",
      "+export const d = 4;",
    ].join("\n");
    const s = detectCommit(
      { author: "alice", message: "add exports" },
      { patch },
    );
    expect(s).not.toBeNull();
    expect(s!.toolId).toBe("cursor");
  });

  it("resolves catalog ids used as hints (generic-bot bucket)", () => {
    // branch prefix ai/ has hint generic-bot — must still resolve to the
    // "AI bot" entry instead of an Unknown row
    const s = detectCommit(
      { author: "alice", message: "work" },
      { branch: "ai/feature-x" },
    );
    expect(s).not.toBeNull();
    expect(s!.toolId).toBe("generic-bot");
    expect(s!.tool).toBe("AI bot");
  });

  it("maps qwen, kilocode and sourcery to their own tools", () => {
    expect(resolveTool("qwen")?.id).toBe("qwen");
    expect(resolveTool("kilocode")?.id).toBe("kilocode");
    expect(resolveTool("sourcery-ai")?.id).toBe("sourcery");
  });

  it("keeps vendor and homepage on aggregated usage", () => {
    const usage = summarizeAgents([
      { author: "alice", message: "x\n\nAssisted-By: Claude Opus 4" },
    ]);
    const claude = usage.find((u) => u.toolId === "claude")!;
    expect(claude.vendor).toBe("Anthropic");
    expect(claude.homepage).toBe("https://claude.com/product/claude-code");
  });
});

describe("detectFiles", () => {
  it("finds common AI tooling paths", () => {
    const found = detectFiles([
      "README.md",
      "src/index.ts",
      "CLAUDE.md",
      ".cursor/rules/foo.md",
      ".github/copilot-instructions.md",
      ".aider.conf.yml",
      "docs/guide.md",
    ]);
    expect(found).toEqual(
      expect.arrayContaining([
        "CLAUDE.md",
        ".cursor/",
        "copilot-instructions.md",
        ".aider",
      ]),
    );
    expect(found).not.toContain("AGENTS.md");
  });

  it("dedupes labels across multiple matching paths", () => {
    const found = detectFiles([".claude/settings.json", ".claude/commands/foo.md"]);
    expect(found).toEqual([".claude/"]);
  });

  it("returns empty for unrelated trees", () => {
    expect(detectFiles(["package.json", "src/App.tsx"])).toEqual([]);
  });
});
