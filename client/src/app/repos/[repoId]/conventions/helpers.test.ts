import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  confidenceColor,
  countByStatus,
  evidenceUrl,
  filterByStatus,
  idsWithStatus,
  pruneSelection,
  toggleSelected,
} from "./helpers";

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  rule: "Validate request bodies with a Zod schema.",
  rationale: null,
  category: "typing",
  evidence_path: "src/user.ts",
  evidence_line: 3,
  evidence_snippet: "export const UserSchema = z.object({",
  confidence: 0.8,
  status: "pending",
  created_at: "2026-09-22T10:00:00.000Z",
  ...over,
});

const BOARD = [
  c({ id: "a", status: "pending" }),
  c({ id: "b", status: "accepted" }),
  c({ id: "d", status: "accepted" }),
  c({ id: "e", status: "rejected" }),
];

describe("countByStatus", () => {
  it("counts each triage chip, with `all` as the total", () => {
    expect(countByStatus(BOARD)).toEqual({ all: 4, pending: 1, accepted: 2, rejected: 1 });
  });

  it("is all zeroes on an empty board", () => {
    expect(countByStatus([])).toEqual({ all: 0, pending: 0, accepted: 0, rejected: 0 });
  });
});

describe("filterByStatus", () => {
  it("keeps the server's order for `all`", () => {
    expect(filterByStatus(BOARD, "all").map((x) => x.id)).toEqual(["a", "b", "d", "e"]);
  });

  it("narrows to one status", () => {
    expect(filterByStatus(BOARD, "accepted").map((x) => x.id)).toEqual(["b", "d"]);
    expect(filterByStatus(BOARD, "rejected").map((x) => x.id)).toEqual(["e"]);
  });
});

describe("selection", () => {
  it("toggles an id in and out without mutating the original set", () => {
    const start = new Set(["a"]);
    const added = toggleSelected(start, "b");
    expect([...added].sort()).toEqual(["a", "b"]);
    expect([...start]).toEqual(["a"]);
    expect([...toggleSelected(added, "a")]).toEqual(["b"]);
  });

  it("prunes ids a re-scan removed from the board", () => {
    const pruned = pruneSelection(new Set(["a", "gone"]), BOARD);
    expect([...pruned]).toEqual(["a"]);
  });

  it("collects the ids of one status for select-all", () => {
    expect(idsWithStatus(BOARD, "accepted")).toEqual(["b", "d"]);
  });
});

describe("confidenceColor", () => {
  const GREEN = "var(--ok)";
  const YELLOW = "var(--yellow)";
  const ORANGE = "var(--orange)";
  const RED = "var(--crit)";

  it("grades each band", () => {
    expect(confidenceColor(100)).toBe(GREEN);
    expect(confidenceColor(90)).toBe(GREEN);
    expect(confidenceColor(78)).toBe(YELLOW);
    expect(confidenceColor(64)).toBe(ORANGE);
    expect(confidenceColor(30)).toBe(RED);
    expect(confidenceColor(0)).toBe(RED);
  });

  // Each threshold is inclusive, so the value ON it must take the HIGHER band.
  it("puts every boundary value in the band above it", () => {
    expect(confidenceColor(85)).toBe(GREEN);
    expect(confidenceColor(84)).toBe(YELLOW);
    expect(confidenceColor(70)).toBe(YELLOW);
    expect(confidenceColor(69)).toBe(ORANGE);
    expect(confidenceColor(60)).toBe(ORANGE);
    expect(confidenceColor(59)).toBe(RED);
  });

  it("never returns undefined for a score outside 0..100", () => {
    expect(confidenceColor(-1)).toBe(RED);
    expect(confidenceColor(Number.NaN)).toBe(RED);
  });
});

describe("evidenceUrl", () => {
  it("deep-links to the exact line on the repo's default branch", () => {
    expect(evidenceUrl("acme/payments-api", "develop", "src/user.ts", 3)).toBe(
      "https://github.com/acme/payments-api/blob/develop/src/user.ts#L3",
    );
  });

  it("falls back to main when the branch is unknown", () => {
    expect(evidenceUrl("acme/payments-api", undefined, "src/user.ts", 3)).toContain("/blob/main/");
  });

  it("returns null when there is nothing to link to", () => {
    expect(evidenceUrl(undefined, "main", "src/user.ts", 3)).toBeNull();
    expect(evidenceUrl("acme/payments-api", "main", "", 3)).toBeNull();
  });

  // WP7 / frontend-architecture-1-3: an unencoded "#" in the path would be
  // read as the URL's line-anchor separator, truncating the link.
  it("percent-encodes a path segment containing '#'", () => {
    expect(evidenceUrl("a/b", "main", "docs/c#-notes.md", 3)).toContain("c%23-notes.md");
  });
});
