import { describe, it, expect } from "vitest";
import { makeConvention } from "@/test/convention-fixtures";
import {
  confidenceTone,
  countByStatus,
  evidenceLabel,
  filterByStatus,
  nextStatus,
  relativeAge,
} from "./helpers";

const LIST = [
  makeConvention({ id: "a", status: "accepted" }),
  makeConvention({ id: "b", status: "pending" }),
  makeConvention({ id: "c", status: "pending" }),
  makeConvention({ id: "d", status: "rejected" }),
];

describe("conventions helpers", () => {
  it("counts and filters by status", () => {
    expect(countByStatus(LIST)).toEqual({ all: 4, pending: 2, accepted: 1, rejected: 1 });
    expect(filterByStatus(LIST, "pending").map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterByStatus(LIST, "all")).toHaveLength(4);
  });

  it("clicking the active decision resets to pending", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBe("pending");
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
    expect(nextStatus("rejected", "rejected")).toBe("pending");
  });

  it("maps confidence to a tone at the thresholds", () => {
    expect(confidenceTone(0.91)).toBe("high");
    expect(confidenceTone(0.8)).toBe("high");
    expect(confidenceTone(0.78)).toBe("warn");
    expect(confidenceTone(0.6)).toBe("warn");
    expect(confidenceTone(0.59)).toBe("low");
  });

  it("labels evidence as path:line or path:start-end", () => {
    expect(evidenceLabel({ path: "src/a.ts", start_line: 3, end_line: 3 })).toBe("src/a.ts:3");
    expect(evidenceLabel({ path: "src/a.ts", start_line: 23, end_line: 31 })).toBe("src/a.ts:23-31");
  });

  it("buckets the scan age", () => {
    const now = Date.parse("2026-09-22T12:00:00Z");
    expect(relativeAge("2026-09-22T11:59:40Z", now)).toEqual({ unit: "justNow" });
    expect(relativeAge("2026-09-22T11:15:00Z", now)).toEqual({ unit: "minutes", count: 45 });
    expect(relativeAge("2026-09-22T10:30:00Z", now)).toEqual({ unit: "hours", count: 1 });
    expect(relativeAge("2026-09-19T12:00:00Z", now)).toEqual({ unit: "days", count: 3 });
  });
});
