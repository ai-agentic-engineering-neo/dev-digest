import { describe, it, expect } from "vitest";
import { buildUrlPayload, isHttpsUrl } from "./helpers";

describe("isHttpsUrl", () => {
  it("accepts https URLs (trimmed)", () => {
    expect(isHttpsUrl("https://raw.githubusercontent.com/org/repo/main/skill.md")).toBe(true);
    expect(isHttpsUrl("  https://example.com/a.md  ")).toBe(true);
  });

  it.each(["http://example.com/a.md", "ftp://example.com/a.md", "file:///etc/passwd", "javascript:alert(1)", "example.com/a.md", "", "https://user:pw@example.com/a.md"])(
    "rejects %s",
    (value) => {
      expect(isHttpsUrl(value)).toBe(false);
    },
  );
});

describe("buildUrlPayload", () => {
  it("omits a blank name and trims the rest", () => {
    expect(buildUrlPayload(" https://x.dev/s.md ", "  ", "rubric")).toEqual({ url: "https://x.dev/s.md", type: "rubric" });
    expect(buildUrlPayload("https://x.dev/s.md", " my-skill ", "custom")).toEqual({
      url: "https://x.dev/s.md",
      name: "my-skill",
      type: "custom",
    });
  });
});
