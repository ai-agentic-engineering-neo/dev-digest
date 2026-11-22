import { describe, it, expect } from "vitest";
import { statusColor } from "./helpers";
import type { PrMeta } from "./constants";

const base = (o: Partial<PrMeta>): PrMeta => ({
  number: 1, title: "t", author: "a", branch: "b", base: "main", head_sha: "h",
  additions: 0, deletions: 0, files_count: 0, status: "reviewed", ...o,
});
const OK = "var(--ok)";

describe("statusColor", () => {
  it("turns a reviewed PR red when an open CRITICAL remains", () => {
    expect(statusColor(base({ findings: { critical: 1, warning: 3, suggestion: 0 } }), OK)).toBe("var(--crit)");
  });
  it("turns a reviewed PR orange when only WARNINGs remain", () => {
    expect(statusColor(base({ findings: { critical: 0, warning: 2, suggestion: 5 } }), OK)).toBe("var(--warn)");
  });
  it("keeps green when only suggestions (or nothing) remain", () => {
    expect(statusColor(base({ findings: { critical: 0, warning: 0, suggestion: 4 } }), OK)).toBe(OK);
    expect(statusColor(base({ findings: null }), OK)).toBe(OK);
  });
  it("leaves non-reviewed statuses alone", () => {
    const f = { critical: 5, warning: 0, suggestion: 0 };
    expect(statusColor(base({ status: "needs_review", findings: f }), "var(--warn)")).toBe("var(--warn)");
    expect(statusColor(base({ status: "stale", findings: f }), "var(--stale)")).toBe("var(--stale)");
  });
});
