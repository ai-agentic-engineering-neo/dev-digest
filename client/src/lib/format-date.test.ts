import { describe, it, expect } from "vitest";
import { formatDateTime } from "./format-date";

describe("formatDateTime", () => {
  it("returns a dash for missing or invalid input and a locale string otherwise", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDateTime("2026-09-26T10:00:00.000Z")).toBe(new Date("2026-09-26T10:00:00.000Z").toLocaleString());
  });
});
