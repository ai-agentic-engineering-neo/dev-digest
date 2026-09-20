import { describe, it, expect, vi } from "vitest";
import { formatWhen, relativeTime } from "./date";

describe("formatWhen", () => {
  it("unparseable date → returns the input string as-is (fallback)", () => {
    expect(formatWhen("invalid")).toBe("invalid");
    expect(formatWhen("not a date")).toBe("not a date");
  });

  it("valid ISO string → locale datetime", () => {
    const iso = "2026-09-20T10:30:00Z";
    const result = formatWhen(iso);
    // Result depends on locale; just verify it's not the input string
    expect(result).not.toBe(iso);
    expect(result).toMatch(/\d/);
  });

  it("handles timezone-aware ISO strings", () => {
    const result = formatWhen("2026-09-20T14:30:00+02:00");
    expect(result).not.toBe("2026-09-20T14:30:00+02:00");
    expect(result).toMatch(/\d/);
  });

  it("handles epoch (1970-01-01)", () => {
    const result = formatWhen("1970-01-01T00:00:00Z");
    expect(result).toMatch(/\d/);
  });
});

describe("relativeTime", () => {
  it("null/undefined → em dash (unknown)", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(undefined)).toBe("—");
  });

  it("unparseable date → em dash", () => {
    expect(relativeTime("invalid")).toBe("—");
    expect(relativeTime("not a date")).toBe("—");
  });

  it("less than 30 seconds ago → 'now'", () => {
    const now = new Date();
    const t20secAgo = new Date(now.getTime() - 20 * 1000).toISOString();
    expect(relativeTime(t20secAgo)).toBe("now");
  });

  it("1–59 minutes ago → 'Xm'", () => {
    const now = new Date();
    const t15minAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    expect(relativeTime(t15minAgo)).toBe("15m");

    const t59minAgo = new Date(now.getTime() - 59 * 60 * 1000).toISOString();
    expect(relativeTime(t59minAgo)).toBe("59m");
  });

  it("1–23 hours ago → 'Xh'", () => {
    const now = new Date();
    const t3hourAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(t3hourAgo)).toBe("3h");

    const t23hourAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(t23hourAgo)).toBe("23h");
  });

  it("24+ hours ago → 'Xd'", () => {
    const now = new Date();
    const t2daysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(t2daysAgo)).toBe("2d");

    const t10daysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(t10daysAgo)).toBe("10d");
  });

  it("rounds minutes correctly", () => {
    const now = new Date();
    // 1 min 30 sec → 2 min (Math.round(90 / 60) = 2)
    const t90secAgo = new Date(now.getTime() - 90 * 1000).toISOString();
    expect(relativeTime(t90secAgo)).toBe("2m");
  });

  it("rounds hours correctly", () => {
    const now = new Date();
    // 90 minutes → 1.5h → Math.round(1.5) = 2h
    const t90minAgo = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    expect(relativeTime(t90minAgo)).toBe("2h");
  });

  it("rounds days correctly", () => {
    const now = new Date();
    // 36 hours → 1.5d → Math.round(1.5) = 2d
    const t36hourAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(t36hourAgo)).toBe("2d");
  });

  it("handles future dates (0 time delta)", () => {
    const future = new Date(Date.now() + 1000).toISOString();
    // Negative delta gets clamped to 0 by Math.max
    expect(relativeTime(future)).toBe("now");
  });
});
