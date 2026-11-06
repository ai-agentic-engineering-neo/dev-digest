import { describe, it, expect } from "vitest";
import { githubPrUrl, githubBlobUrl } from "./github-urls";

describe("githubPrUrl", () => {
  it("builds the pull request link", () => {
    expect(githubPrUrl("acme/widgets", 42)).toBe("https://github.com/acme/widgets/pull/42");
  });
});

describe("githubBlobUrl", () => {
  it("pins to the sha and omits the anchor without a start line", () => {
    expect(githubBlobUrl("acme/widgets", "abc123", "src/a.ts")).toBe(
      "https://github.com/acme/widgets/blob/abc123/src/a.ts",
    );
  });

  it("adds a single-line anchor, or a range only when end differs from start", () => {
    const base = "https://github.com/acme/widgets/blob/abc123/src/a.ts";
    expect(githubBlobUrl("acme/widgets", "abc123", "src/a.ts", 7)).toBe(`${base}#L7`);
    expect(githubBlobUrl("acme/widgets", "abc123", "src/a.ts", 7, 7)).toBe(`${base}#L7`);
    expect(githubBlobUrl("acme/widgets", "abc123", "src/a.ts", 7, 12)).toBe(`${base}#L7-L12`);
  });

  it("encodes path segments but keeps the slashes", () => {
    expect(githubBlobUrl("acme/widgets", "abc123", "my dir/a#b?.ts", 1)).toBe(
      "https://github.com/acme/widgets/blob/abc123/my%20dir/a%23b%3F.ts#L1",
    );
  });

  it("treats startLine 0 as a real line (null check, not truthiness)", () => {
    expect(githubBlobUrl("acme/widgets", "abc123", "a.ts", 0)).toBe(
      "https://github.com/acme/widgets/blob/abc123/a.ts#L0",
    );
  });

  it("emits no anchor when only endLine is given", () => {
    expect(githubBlobUrl("acme/widgets", "abc123", "a.ts", undefined, 9)).toBe(
      "https://github.com/acme/widgets/blob/abc123/a.ts",
    );
  });

  // Known gap: a reversed range (start 10, end 5) currently yields "#L10-L5", which GitHub does not
  // highlight. The intended contract is undecided (swap to #L5-L10, or drop the range), so it is not
  // asserted here; turn this into a real test once githubBlobUrl normalises the range.
  it.todo("normalises a reversed range (endLine < startLine)");

  it("percent-encodes unicode and re-encodes literal percent signs", () => {
    expect(githubBlobUrl("acme/widgets", "abc123", "docs/é/100%.md")).toBe(
      "https://github.com/acme/widgets/blob/abc123/docs/%C3%A9/100%25.md",
    );
    // already-encoded input is double-encoded, not left alone
    expect(githubBlobUrl("acme/widgets", "abc123", "my%20dir/a.ts")).toBe(
      "https://github.com/acme/widgets/blob/abc123/my%2520dir/a.ts",
    );
  });
});
