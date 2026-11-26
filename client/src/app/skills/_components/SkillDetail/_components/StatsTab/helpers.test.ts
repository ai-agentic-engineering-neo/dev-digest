import { describe, it, expect } from "vitest";
import { acceptTone, agentSkillsHref, formatDay, formatRate, formatRelative } from "./helpers";

describe("StatsTab helpers", () => {
  it("formats the accept rate as a rounded percent and — when nothing was decided", () => {
    expect(formatRate(0.666)).toBe("67%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(null)).toBe("—");
  });

  it("bands the accept rate at 60% and 40%", () => {
    expect(acceptTone(0.6)).toBe("good");
    expect(acceptTone(0.59)).toBe("fair");
    expect(acceptTone(0.4)).toBe("fair");
    expect(acceptTone(0.39)).toBe("poor");
    expect(acceptTone(null)).toBe("none");
  });

  it("formats dates relative to now and as YYYY-MM-DD", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    expect(formatRelative("2026-11-24T12:00:00Z", now, "en")).toBe("2 days ago");
    expect(formatRelative("2026-11-26T09:00:00Z", now, "en")).toBe("3 hours ago");
    expect(formatRelative("bad", now, "en")).toBe("—");
    expect(formatDay("2026-11-24T12:00:00Z")).toBe("2026-11-24");
  });

  it("links to the agent's Skills tab with an encoded id", () => {
    expect(agentSkillsHref("ag 1")).toBe("/agents/ag%201?tab=skills");
  });
});
