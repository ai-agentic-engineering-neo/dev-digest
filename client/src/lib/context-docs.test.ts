import { describe, it, expect } from "vitest";
import { CONTEXT_TOKEN_CAP, filterDocs, shortenPath, sumTokens } from "./context-docs";

const DOCS = [
  { path: "README.md" },
  { path: "client/INSIGHTS.md" },
  { path: "server/specs/a.md" },
  { path: "docs/guide.md" },
];

describe("filterDocs (AC-3)", () => {
  it("matches a folder case-insensitively", () => {
    expect(filterDocs(DOCS, "SPECS").map((d) => d.path)).toEqual(["server/specs/a.md"]);
  });

  it("matches a file name case-insensitively", () => {
    expect(filterDocs(DOCS, "insights").map((d) => d.path)).toEqual(["client/INSIGHTS.md"]);
  });

  it("returns every doc for empty or blank text, and none for a non-match", () => {
    expect(filterDocs(DOCS, "")).toEqual(DOCS);
    expect(filterDocs(DOCS, "   ")).toEqual(DOCS);
    expect(filterDocs(DOCS, "zzz")).toEqual([]);
  });
});

describe("sumTokens (AC-7)", () => {
  it("adds known estimates and counts missing docs as 0", () => {
    expect(sumTokens([{ tokens: 3000 }, { tokens: null }, { tokens: 1500 }])).toBe(4500);
    expect(sumTokens([])).toBe(0);
    expect(CONTEXT_TOKEN_CAP).toBe(4000);
  });
});

describe("shortenPath", () => {
  it("keeps short paths as they are", () => {
    expect(shortenPath("docs/a.md", 48)).toBe("docs/a.md");
  });

  it("keeps the file name and replaces the middle with …/", () => {
    const out = shortenPath("server/specs/very/deep/folder/structure/with/many/levels/a-file.md", 30);
    expect(out.endsWith("…/a-file.md")).toBe(true);
    expect(out.startsWith("server/")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("falls back to …/<name> when only the name fits", () => {
    expect(shortenPath("abcdefghij/klmnop/a-very-long-file-name.md", 20)).toBe("…/a-very-long-file-name.md");
  });
});
