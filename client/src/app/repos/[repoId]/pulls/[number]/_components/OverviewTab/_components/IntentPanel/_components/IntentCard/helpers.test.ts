import { describe, it, expect } from "vitest";
import type { IntentSource } from "@/lib/types";
import { confidenceTone, isDimmed, shortSha, linesToItems, itemsToLines } from "./helpers";

const source = (status: IntentSource["status"]): IntentSource => ({
  id: "s",
  kind: "issue",
  ref: "#1",
  weight: "strong",
  status,
  reason: null,
  used: true,
  cited: false,
  issue_number: 1,
  path: null,
});

describe("intent card helpers", () => {
  it("maps confidence to CSS variable tones", () => {
    expect(confidenceTone("high").color).toBe("var(--accent-text)");
    expect(confidenceTone("low").bg).toBe("var(--warn-bg)");
  });
  it("dims every source that was not read", () => {
    expect(isDimmed(source("read"))).toBe(false);
    expect(isDimmed(source("unavailable"))).toBe(true);
  });
  it("shortens a sha to 7 chars", () => {
    expect(shortSha("abcdef1234567")).toBe("abcdef1");
    expect(shortSha(null)).toBeNull();
  });
  it("splits lines, trims, drops blanks and flags overflow", () => {
    expect(linesToItems(" a \n\n b\n", 8)).toEqual({ items: ["a", "b"], tooMany: false });
    expect(linesToItems("a\nb\nc", 2).tooMany).toBe(true);
  });
  it("joins items with newlines", () => {
    expect(itemsToLines(["a", "b"])).toBe("a\nb");
  });
});
