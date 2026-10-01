import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingKey, partitionFindings } from "./findings";

const f = (id: string, start_line: number) => ({ id, start_line }) as FindingRecord;

describe("findings helpers", () => {
  it("keys on the RIGHT side and splits matched vs off-diff", () => {
    expect(findingKey(f("a", 7))).toBe("RIGHT:7");
    const { matched, offDiff } = partitionFindings(
      [f("a", 7), f("b", 7), f("c", 50)],
      new Set(["RIGHT:7"]),
    );
    expect(matched.get("RIGHT:7")?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(offDiff.map((x) => x.id)).toEqual(["c"]);
  });
});
