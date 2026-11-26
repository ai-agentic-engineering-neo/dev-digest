import { describe, it, expect } from "vitest";
import {
  confidenceColor,
  countByStatus,
  defaultSelection,
  evidenceLabel,
  evidenceOf,
  filterByStatus,
  hasLines,
  isValidSkillName,
  newestScan,
  nextStatus,
  refFor,
  selectedAccepted,
  skillConfigHref,
  statusOf,
  toggleId,
} from "./helpers";
import { makeCandidate } from "./test-utils";

const pending = makeCandidate({ id: "p" });
const accepted = makeCandidate({ id: "a", status: "accepted", accepted: true });
const inSkill = makeCandidate({ id: "s", status: "accepted", accepted: true, skill_names: ["x-conventions"] });
const rejected = makeCandidate({ id: "r", status: "rejected" });
const ALL = [pending, accepted, inSkill, rejected];

describe("conventions helpers", () => {
  it("derives status, falling back to `accepted` for older producers", () => {
    expect(statusOf(rejected)).toBe("rejected");
    expect(statusOf(makeCandidate({ status: undefined, accepted: true }))).toBe("accepted");
    expect(statusOf(makeCandidate({ status: undefined, accepted: false }))).toBe("pending");
  });

  it("counts and filters by status", () => {
    expect(countByStatus(ALL)).toEqual({ all: 4, pending: 1, accepted: 2, rejected: 1 });
    expect(filterByStatus(ALL, "accepted").map((c) => c.id)).toEqual(["a", "s"]);
    expect(filterByStatus(ALL, "all")).toHaveLength(4);
  });

  it("selects accepted rules not yet in a skill by default; only accepted ones count", () => {
    expect([...defaultSelection(ALL)]).toEqual(["a"]);
    expect(selectedAccepted(ALL, new Set(["p", "a", "s", "r"]))).toEqual(["a", "s"]);
    expect([...toggleId(new Set(["a"]), "a")]).toEqual([]);
    expect([...toggleId(new Set(), "a")]).toEqual(["a"]);
  });

  it("switches Accept ↔ Reject only; the active one is a no-op (no way back to pending)", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBeNull();
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
    expect(nextStatus("rejected", "rejected")).toBeNull();
    expect(nextStatus("rejected", "accepted")).toBe("accepted");
  });

  it("picks the newer scan meta", () => {
    const old = { at: "2026-11-26T10:00:00Z", commit_sha: "a", files_sampled: 1, model: "m" };
    const fresh = { ...old, at: "2026-11-26T11:00:00Z", commit_sha: "b" };
    expect(newestScan(fresh, old)).toBe(fresh);
    expect(newestScan(old, fresh)).toBe(fresh);
    expect(newestScan(null, old)).toBe(old);
    expect(newestScan(undefined, null)).toBeNull();
  });

  it("labels evidence, falls back to the flat columns, and picks a ref", () => {
    expect(evidenceLabel({ path: "a.ts", line_start: 4, line_end: 4, snippet: "" })).toBe("a.ts:4");
    expect(evidenceLabel({ path: "a.ts", line_start: 4, line_end: 9, snippet: "" })).toBe("a.ts:4-9");
    const legacy = evidenceOf(makeCandidate({ evidence: undefined }));
    expect(legacy).toHaveLength(1);
    // Legacy rows have no verified lines → label without lines (no fake ":1").
    expect(evidenceLabel(legacy[0]!)).toBe("src/api/users.ts");
    expect(hasLines(legacy[0]!)).toBe(false);
    expect(evidenceOf(makeCandidate({ evidence: undefined, evidence_path: "" }))).toEqual([]);
    expect(refFor("abc")).toBe("abc");
    expect(refFor(null)).toBe("HEAD");
  });

  it("validates skill names like the server", () => {
    expect(isValidSkillName("payments-api-conventions")).toBe(true);
    expect(isValidSkillName("Bad Name")).toBe(false);
    expect(isValidSkillName("a--b")).toBe(false);
    expect(isValidSkillName("a".repeat(65))).toBe(false);
    expect(isValidSkillName("")).toBe(false);
  });

  it("colours confidence with status tokens and links to Config", () => {
    expect(confidenceColor(0.9)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.5)).toBe("var(--crit)");
    expect(skillConfigHref("sk 1")).toBe("/skills/sk%201?tab=config");
  });
});
