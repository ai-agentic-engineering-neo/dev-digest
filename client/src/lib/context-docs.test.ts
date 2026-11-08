import { describe, it, expect } from "vitest";
import {
  CONTEXT_TOKEN_CAP,
  DOC_SOURCE_COLORS,
  filterDocs,
  shortenPath,
  splitDocPath,
  sumTokens,
} from "./context-docs";

describe("DOC_SOURCE_COLORS (SPEC-04 AC-1)", () => {
  it("has one distinct colour for each of the 5 sources", () => {
    expect(Object.keys(DOC_SOURCE_COLORS).sort()).toEqual(["devdigest", "docs", "insights", "readme", "specs"]);
    expect(new Set(Object.values(DOC_SOURCE_COLORS).map((c) => c.color)).size).toBe(5);
  });
});

describe("splitDocPath (SPEC-04 AC-1)", () => {
  it("splits a nested path into name and folder", () => {
    expect(splitDocPath("server/specs/a.md")).toEqual({ name: "a.md", folder: "server/specs" });
  });

  it("gives a root file an empty folder", () => {
    expect(splitDocPath("README.md")).toEqual({ name: "README.md", folder: "" });
  });
});

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
