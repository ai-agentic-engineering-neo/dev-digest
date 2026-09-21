import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./helpers";

describe("formatRelativeTime", () => {
  it("renders 'just now' for a timestamp under a minute old", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("just now");
  });

  it("renders minutes for a timestamp under an hour old", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("5m ago");
  });

  it("renders hours for a timestamp under a day old", () => {
    const iso = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("3h ago");
  });

  it("renders days for anything a day or older", () => {
    const iso = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("2d ago");
  });
});
