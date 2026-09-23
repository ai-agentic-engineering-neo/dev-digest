import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, countByStatus, evidenceLabel, filterCandidates, githubEvidenceUrl } from "./helpers";

function candidate(partial: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    repo_id: "r1",
    category: "naming",
    rule: "Use camelCase for variables",
    rationale: null,
    evidence_path: "src/a.ts",
    evidence_line: 3,
    evidence_snippet: "const fooBar = 1;",
    confidence: 0.8,
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("filterCandidates", () => {
  const list = [
    candidate({ id: "p1", status: "pending", confidence: 0.5 }),
    candidate({ id: "p2", status: "pending", confidence: 0.9 }),
    candidate({ id: "a1", status: "accepted", confidence: 0.7 }),
    candidate({ id: "r1", status: "rejected", confidence: 0.6 }),
  ];

  it("shows only pending candidates, highest confidence first", () => {
    const result = filterCandidates(list, "pending");
    expect(result.map((c) => c.id)).toEqual(["p2", "p1"]);
  });

  it("shows only accepted candidates", () => {
    expect(filterCandidates(list, "accepted").map((c) => c.id)).toEqual(["a1"]);
  });

  it("shows only rejected candidates", () => {
    expect(filterCandidates(list, "rejected").map((c) => c.id)).toEqual(["r1"]);
  });

  it("'all' returns every candidate, sorted by confidence", () => {
    expect(filterCandidates(list, "all").map((c) => c.id)).toEqual(["p2", "a1", "r1", "p1"]);
  });
});

describe("countByStatus", () => {
  it("counts each status plus a total", () => {
    const list = [
      candidate({ status: "pending" }),
      candidate({ status: "pending" }),
      candidate({ status: "accepted" }),
      candidate({ status: "rejected" }),
    ];
    expect(countByStatus(list)).toEqual({ pending: 2, accepted: 1, rejected: 1, all: 4 });
  });
});

describe("confidenceColor", () => {
  it("uses the ok color at/above the high threshold", () => {
    expect(confidenceColor(0.9)).toBe("var(--ok)");
  });
  it("uses the warn color in the middle band", () => {
    expect(confidenceColor(0.7)).toBe("var(--warn)");
  });
  it("uses the muted color below the low threshold", () => {
    expect(confidenceColor(0.4)).toBe("var(--text-muted)");
  });
});

describe("evidenceLabel", () => {
  it("appends the line number when present", () => {
    expect(evidenceLabel("src/a.ts", 12)).toBe("src/a.ts:12");
  });
  it("omits the line number when absent", () => {
    expect(evidenceLabel("src/a.ts", null)).toBe("src/a.ts");
  });
});

describe("githubEvidenceUrl", () => {
  it("builds a blob link on the repo's branch, anchored to the line", () => {
    expect(githubEvidenceUrl("acme/payments-api", "main", "src/a.ts", 12)).toBe(
      "https://github.com/acme/payments-api/blob/main/src/a.ts#L12",
    );
  });

  it("falls back to HEAD when no branch is known", () => {
    expect(githubEvidenceUrl("acme/payments-api", undefined, "src/a.ts")).toBe(
      "https://github.com/acme/payments-api/blob/HEAD/src/a.ts",
    );
  });

  it("returns null when the repo full name is unknown", () => {
    expect(githubEvidenceUrl(undefined, "main", "src/a.ts")).toBeNull();
  });

  it("returns null when the path is empty", () => {
    expect(githubEvidenceUrl("acme/payments-api", "main", "")).toBeNull();
  });
});
