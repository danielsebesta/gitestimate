import { describe, expect, it } from "vitest";
import { detectCommit, detectFiles } from "./agents";

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

  it("marks bot author identities as authored", () => {
    const s = detectCommit({
      author: "copilot[bot]",
      authorEmail: "copilot@github.com",
      message: "implement feature",
    });
    expect(s).toMatchObject({ strength: "authored", via: "author" });
  });

  it("marks bot committer identities as authored via committer", () => {
    const s = detectCommit({
      author: "alice",
      authorEmail: "alice@example.com",
      committer: "cursor[bot]",
      committerEmail: "cursoragent@cursor.com",
      message: "apply patch",
    });
    expect(s).toMatchObject({ strength: "authored", via: "committer" });
  });

  it("marks Co-authored-by AI trailers as assisted", () => {
    const s = detectCommit({
      author: "alice",
      message: "refactor\n\nCo-authored-by: Devin AI <devin-ai-integration[bot]@users.noreply.github.com>",
    });
    expect(s).toMatchObject({ strength: "assisted", via: "trailer" });
    expect(s!.marker).toMatch(/co-author/i);
  });

  it("marks message markers as assisted", () => {
    expect(
      detectCommit({
        author: "alice",
        message: "Generated with Claude Code",
      }),
    ).toMatchObject({ strength: "assisted", via: "trailer" });

    expect(
      detectCommit({
        author: "alice",
        message: "Made-with: Cursor",
      }),
    ).toMatchObject({ strength: "assisted", via: "trailer" });
  });

  it("prefers authored author match over message trailers", () => {
    const s = detectCommit({
      author: "claude[bot]",
      authorEmail: "noreply@anthropic.com",
      message: "Generated with Claude Code",
    });
    expect(s).toMatchObject({ strength: "authored", via: "author" });
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
