import { describe, expect, it } from "vitest";
import {
  approxTokens,
  assembleSkillBody,
  confidencePercent,
  evidenceHref,
  formatLastScan,
  headingSlug,
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

describe("approxTokens / assembleSkillBody", () => {
  it("counts ceil(chars/4)", () => {
    expect(approxTokens("abcd")).toBe(1);
  });

  it("omits non-accepted rows and slugifies headings", () => {
    const body = assembleSkillBody("payments-api-conventions", "payments-api", [
      {
        status: "accepted",
        category: "async",
        rule: "Use p-queue",
        evidence_path: "src/a.ts",
        evidence_start_line: 2,
        evidence_end_line: 4,
        evidence_snippet: "Use p-queue",
        confidence: 0.9,
        accepted: true,
        id: "a",
      },
      {
        status: "rejected",
        category: "security",
        rule: "Do not leak secrets",
        evidence_path: "src/c.ts",
        evidence_start_line: 1,
        evidence_end_line: 2,
        evidence_snippet: "secret",
        confidence: 0.4,
        accepted: false,
        id: "c",
      },
    ]);
    expect(body).toContain("Use p-queue");
    expect(body).not.toContain("Do not leak secrets");
    expect(headingSlug("Async / Await")).toBe("async-await");
  });
});
