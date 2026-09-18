import { describe, expect, it } from "vitest";
import {
  confidencePercent,
  evidenceHref,
  formatLastScan,
  pathRangeLabel,
  repoDisplayName,
} from "./helpers";

describe("pathRangeLabel", () => {
  it("formats path:start-end", () => {
    expect(pathRangeLabel("src/api/users.ts", 23, 31)).toBe("src/api/users.ts:23-31");
    expect(pathRangeLabel("src/a.ts", 4, 4)).toBe("src/a.ts:4");
    expect(pathRangeLabel("src/a.ts", null, null)).toBe("src/a.ts");
  });
});

describe("evidenceHref", () => {
  it("builds GitHub blob/#L23-L31 and GitLab -/blob/#L23-31", () => {
    expect(
      evidenceHref("github", "acme/payments-api", "main", "src/api/users.ts", 23, 31),
    ).toBe("https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23-L31");
    expect(
      evidenceHref("gitlab", "acme/payments-api", "main", "src/api/users.ts", 23, 31),
    ).toBe("https://gitlab.com/acme/payments-api/-/blob/main/src/api/users.ts#L23-31");
  });
});

describe("confidencePercent / repoDisplayName / formatLastScan", () => {
  it("rounds confidence and takes the last path segment", () => {
    expect(confidencePercent(0.91)).toBe(91);
    expect(repoDisplayName("acme/payments-api", "repo")).toBe("payments-api");
  });

  it("formats last-scan relative to now", () => {
    const now = Date.parse("2026-09-19T12:00:00Z");
    expect(formatLastScan("2026-09-19T11:00:00Z", now)).toBe("1h ago");
  });
});
