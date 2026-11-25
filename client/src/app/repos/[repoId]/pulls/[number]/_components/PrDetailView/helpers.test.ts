import { describe, it, expect } from "vitest";
import type { FindingRecord, PrMeta, ReviewRecord } from "@devdigest/shared";
import { collectFindings, findRun, resolvePrId, selectLethalTrifecta } from "./helpers";

const finding = (id: string, kind?: string) => ({ id, kind }) as unknown as FindingRecord;
const review = (run_id: string, findings: FindingRecord[]) =>
  ({ run_id, findings }) as unknown as ReviewRecord;
const pr = (number: number, id: string) => ({ number, id }) as unknown as PrMeta;

describe("resolvePrId", () => {
  it("maps a route PR number (string or number) to the row id", () => {
    const pulls = [pr(7, "u7"), pr(8, "u8")];
    expect(resolvePrId(pulls, "8")).toBe("u8");
    expect(resolvePrId(pulls, 7)).toBe("u7");
  });

  it("returns null while the list is loading or the number is unknown", () => {
    expect(resolvePrId(undefined, "8")).toBeNull();
    expect(resolvePrId([pr(7, "u7")], "9")).toBeNull();
  });
});

describe("collectFindings / selectLethalTrifecta", () => {
  const runs = [review("r1", [finding("a"), finding("b", "lethal_trifecta")]), review("r2", [finding("c")])];

  it("flattens findings across runs in order", () => {
    expect(collectFindings(runs).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps only lethal-trifecta findings", () => {
    expect(selectLethalTrifecta(collectFindings(runs)).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("findRun", () => {
  const runs = [review("r1", []), review("r2", [])];

  it("finds the review for a run id", () => {
    expect(findRun(runs, "r2")?.run_id).toBe("r2");
  });

  it("returns undefined for null or unknown ids", () => {
    expect(findRun(runs, null)).toBeUndefined();
    expect(findRun(runs, "zz")).toBeUndefined();
  });
});
