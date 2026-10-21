import { describe, it, expect } from "vitest";
import { defaultContextRepoId, isOverPromptCap, serializeContextBlock, sumCheckedTokens } from "./project-context";

describe("defaultContextRepoId (AC-22)", () => {
  it("is the only repository, whatever the active one is", () => {
    expect(defaultContextRepoId([{ id: "r1" }], "other")).toBe("r1");
    expect(defaultContextRepoId([{ id: "r1" }], null)).toBe("r1");
  });
  it("with several, is the shell's active repository", () => {
    expect(defaultContextRepoId([{ id: "r1" }, { id: "r2" }], "r2")).toBe("r2");
  });
  it("falls back to the first when the active id is unknown or missing; null with no repos", () => {
    expect(defaultContextRepoId([{ id: "r1" }, { id: "r2" }], "zzz")).toBe("r1");
    expect(defaultContextRepoId([{ id: "r1" }, { id: "r2" }], null)).toBe("r1");
    expect(defaultContextRepoId([], "r1")).toBeNull();
  });
});

describe("token totals (AC-24)", () => {
  const files = [{ path: "a.md", tokens: 10 }, { path: "b.md", tokens: 20 }, { path: "big.md", tokens: null }];
  it("sums listed checked paths; unknown and too-large rows add nothing", () => {
    expect(sumCheckedTokens(["a.md", "b.md", "gone.md", "big.md"], files)).toBe(30);
  });
  it("warns strictly above the cap", () => {
    expect(isOverPromptCap(24_000)).toBe(false);
    expect(isOverPromptCap(24_001)).toBe(true);
  });
});

describe("serializeContextBlock (AC-21)", () => {
  it("is the heading plus one path per line", () => {
    expect(serializeContextBlock(["docs/a.md", "specs/b.md"])).toBe("## Project context\ndocs/a.md\nspecs/b.md");
  });
});

describe("override draft rules (AC-60, AC-61)", () => {
  it("saves only a changed draft within the cap", async () => {
    const { canSaveDraft, isOverFileCap, PROJECT_CONTEXT_FILE_MAX_CHARS: cap } = await import("./project-context");
    expect(canSaveDraft("same", "same")).toBe(false);
    expect(canSaveDraft("changed", "same")).toBe(true);
    expect(canSaveDraft("", "same")).toBe(true); // empty is the server's 422 to explain (D12)
    expect(canSaveDraft("x".repeat(cap), "y")).toBe(true);
    expect(canSaveDraft("x".repeat(cap + 1), "y")).toBe(false);
    expect(isOverFileCap("x".repeat(cap + 1))).toBe(true);
    expect(isOverFileCap("x".repeat(cap))).toBe(false);
  });
});
