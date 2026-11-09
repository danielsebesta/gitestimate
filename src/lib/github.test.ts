import { describe, expect, it } from "vitest";
import { parseLastPage, parseRepo } from "./github";

describe("parseLastPage", () => {
  it("reads rel=last page from a GitHub Link header", () => {
    const link =
      '<https://api.github.com/repos/o/r/commits?per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repos/o/r/commits?per_page=1&page=97>; rel="last"';
    expect(parseLastPage(link)).toBe(97);
  });

  it("returns null when Link is missing or has no last", () => {
    expect(parseLastPage(null)).toBeNull();
    expect(parseLastPage('<https://api.github.com/x?page=2>; rel="next"')).toBeNull();
  });
});

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
