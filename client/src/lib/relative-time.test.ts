import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("covers the now / minutes / hours / days bands and guards bad input", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime("nope")).toBe("—");
    expect(relativeTime("2026-09-26T11:59:50.000Z")).toBe("now");
    expect(relativeTime("2026-09-26T11:48:00.000Z")).toBe("12m");
    expect(relativeTime("2026-09-26T09:00:00.000Z")).toBe("3h");
    expect(relativeTime("2026-09-24T12:00:00.000Z")).toBe("2d");
  });
});
