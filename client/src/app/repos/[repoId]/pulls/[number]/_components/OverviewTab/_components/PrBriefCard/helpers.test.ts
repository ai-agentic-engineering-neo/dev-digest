import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { generateErrorView, truncationParts, shortSha } from "./helpers";

describe("PrBriefCard helpers", () => {
  it("maps API errors to views", () => {
    expect(generateErrorView(null)).toBeNull();
    expect(
      generateErrorView(new ApiError("x", 502, "brief_generation_failed", { reason: "timeout" })),
    ).toEqual({ kind: "failed", reason: "timeout" });
    expect(
      generateErrorView(new ApiError("x", 422, "brief_too_large", { tokens: 9120, limit: 8000 })),
    ).toEqual({ kind: "too_large", tokens: 9120, limit: 8000 });
    expect(
      generateErrorView(new ApiError("x", 422, "brief_model_not_configured", { provider: "openrouter" })),
    ).toEqual({ kind: "not_configured", provider: "openrouter" });
    expect(generateErrorView(new ApiError("x", 422, "brief_no_changed_files"))).toEqual({ kind: "no_files" });
    expect(generateErrorView(new ApiError("boom", 500))).toEqual({ kind: "unknown", message: "boom" });
    expect(generateErrorView(new Error("net"))).toEqual({ kind: "unknown", message: "net" });
  });

  it("lists only non-zero truncation parts and shortens shas", () => {
    expect(truncationParts({ spec_docs: 2, callers: 31, boilerplate_hunk_files: 0 })).toEqual([
      { key: "specDocs", count: 2 },
      { key: "callers", count: 31 },
    ]);
    expect(truncationParts({ spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 })).toEqual([]);
    expect(shortSha("abcdef1234")).toBe("abcdef1");
  });
});
