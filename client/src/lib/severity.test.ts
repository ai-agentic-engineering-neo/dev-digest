import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { highestSeverity, isActiveFinding } from "./severity";

/** Minimal finding fixture — only the fields `highestSeverity`/`isActiveFinding` read. */
function f(
  severity: FindingRecord["severity"],
  dismissed_at: string | null = null,
): Pick<FindingRecord, "severity" | "dismissed_at"> {
  return { severity, dismissed_at };
}

describe("highestSeverity", () => {
  it("returns the highest-ranked ACTIVE severity, ignoring a dismissed CRITICAL", () => {
    const result = highestSeverity([
      f("WARNING"),
      f("CRITICAL", "2026-09-01T00:00:00Z"),
      f("SUGGESTION"),
    ]);
    expect(result).toBe("WARNING");
  });

  it("returns null for an empty list", () => {
    expect(highestSeverity([])).toBeNull();
  });

  it("returns null when every finding is dismissed", () => {
    const result = highestSeverity([
      f("CRITICAL", "2026-09-01T00:00:00Z"),
      f("WARNING", "2026-09-02T00:00:00Z"),
    ]);
    expect(result).toBeNull();
  });
});

describe("isActiveFinding", () => {
  it("is true when dismissed_at is null", () => {
    expect(isActiveFinding({ dismissed_at: null })).toBe(true);
  });

  it("is false once dismissed_at is set", () => {
    expect(isActiveFinding({ dismissed_at: "2026-09-01T00:00:00Z" })).toBe(false);
  });
});
