import { describe, expect, it } from "vitest";
import { parseRepo } from "./github";

describe("parseRepo", () => {
  it("parses owner/repo", () => {
    expect(parseRepo("facebook/react")).toEqual({ owner: "facebook", repo: "react" });
  });

  it("parses URLs and github.com prefixes", () => {
    expect(parseRepo("https://github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseRepo("http://www.github.com/facebook/react.git")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseRepo("github.com/facebook/react/")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("trims whitespace and accepts dots/dashes in names", () => {
    expect(parseRepo("  my.org/my-repo.name  ")).toEqual({
      owner: "my.org",
      repo: "my-repo.name",
    });
  });

  it("returns null for invalid input", () => {
    expect(parseRepo("")).toBeNull();
    expect(parseRepo("noslash")).toBeNull();
    expect(parseRepo("one/two/three")).toBeNull();
    expect(parseRepo("https://gitlab.com/foo/bar")).toBeNull();
  });
});
