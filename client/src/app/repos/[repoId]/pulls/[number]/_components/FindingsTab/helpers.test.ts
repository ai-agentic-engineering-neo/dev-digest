import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { findingsByRunId, keyboardReviewId, lethalTrifectaCount } from "./helpers";

const finding = (id: string, kind: FindingRecord["kind"] = "finding") => ({ id, kind }) as FindingRecord;
const review = (id: string, run_id: string | null, findings: FindingRecord[] = []) =>
  ({ id, run_id, findings }) as ReviewRecord;

describe("findingsByRunId", () => {
  it("maps each run to its findings and skips reviews without a run", () => {
    const a = [finding("f1")];
    const map = findingsByRunId([review("r1", "run-1", a), review("r2", null, [finding("f2")])]);
    expect([...map.keys()]).toEqual(["run-1"]);
    expect(map.get("run-1")).toBe(a);
  });
});

describe("lethalTrifectaCount", () => {
  it("counts lethal_trifecta findings across every run", () => {
    const reviews = [
      review("r1", "run-1", [finding("a", "lethal_trifecta"), finding("b")]),
      review("r2", "run-2", [finding("c", "lethal_trifecta")]),
    ];
    expect(lethalTrifectaCount(reviews)).toBe(2);
    expect(lethalTrifectaCount([])).toBe(0);
  });
});

describe("keyboardReviewId", () => {
  const reviews = [review("new", "run-2"), review("old", "run-1")];
  it("defaults to the newest review", () => {
    expect(keyboardReviewId(reviews, null)).toBe("new");
  });
  it("keeps the chosen review while it still exists", () => {
    expect(keyboardReviewId(reviews, "old")).toBe("old");
  });
  it("falls back to the newest when the chosen review was deleted", () => {
    expect(keyboardReviewId(reviews, "gone")).toBe("new");
  });
  it("is null without reviews", () => {
    expect(keyboardReviewId([], "x")).toBeNull();
  });
});
