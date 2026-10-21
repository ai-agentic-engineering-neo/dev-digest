import { describe, it, expect } from "vitest";
import type { PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { displayedFindings, joinGroupFiles, resolveDeepLink } from "./helpers";

const file = (path: string, ids: string[] = []) => ({
  path,
  additions: 2,
  deletions: 1,
  finding_lines: [],
  finding_ids: ids,
});

const SMART: SmartDiffResponse = {
  has_review: true,
  groups: [
    { role: "core", files: [file("a.ts", ["f1"]), file("gone.ts")] },
    { role: "tests", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

const finding = (id: string) => ({
  id,
  severity: "INFO",
  category: "bug",
  title: id,
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  confidence: 0.5,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
});

describe("displayedFindings", () => {
  it("returns only findings whose id the server selected", () => {
    const reviews = [{ findings: [finding("f1"), finding("old")] }] as unknown as ReviewRecord[];
    expect(displayedFindings(SMART, reviews).map((f) => f.id)).toEqual(["f1"]);
  });
  it("is empty while either source is missing", () => {
    expect(displayedFindings(undefined, [])).toEqual([]);
    expect(displayedFindings(SMART, undefined)).toEqual([]);
  });
});

describe("joinGroupFiles", () => {
  it("takes patches from pr.files and gives unknown paths a null patch", () => {
    const prFiles: PrFile[] = [{ path: "a.ts", additions: 2, deletions: 1, patch: "@@" }];
    const out = joinGroupFiles(SMART.groups[0]!, prFiles);
    expect(out[0]!.patch).toBe("@@");
    expect(out[1]).toEqual({ path: "gone.ts", additions: 2, deletions: 1, patch: null });
  });
});

describe("resolveDeepLink", () => {
  const files = [{ path: "a.ts", additions: 1, deletions: 0, patch: null }] as PrFile[];
  it("accepts only changed paths and positive integer lines", () => {
    expect(resolveDeepLink(files, "a.ts", "12")).toEqual({ path: "a.ts", line: 12 });
    expect(resolveDeepLink(files, "a.ts", null)).toEqual({ path: "a.ts", line: null });
    expect(resolveDeepLink(files, "a.ts", "0")).toEqual({ path: "a.ts", line: null });
    expect(resolveDeepLink(files, "a.ts", "12abc")).toEqual({ path: "a.ts", line: null });
    expect(resolveDeepLink(files, "gone.ts", "3")).toBeNull();
    expect(resolveDeepLink(files, "../etc/passwd", "3")).toBeNull();
    expect(resolveDeepLink(files, null, "3")).toBeNull();
  });
});
