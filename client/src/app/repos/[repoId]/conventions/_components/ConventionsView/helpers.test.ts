import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedOf, bulkAction } from "./helpers";

const c = (id: string, status: ConventionCandidate["status"]): ConventionCandidate => ({
  id,
  status,
  category: "x",
  rule: "r",
  evidence_path: null,
  evidence_start_line: null,
  evidence_end_line: null,
  evidence_snippet: null,
  confidence: 0.5,
});

describe("ConventionsView helpers", () => {
  it("acceptedOf keeps display order", () => {
    expect(acceptedOf([c("a", "accepted"), c("b", "pending"), c("d", "accepted")]).map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("bulkAction: deselect when anything is accepted, else accept pending, else none", () => {
    expect(bulkAction([c("a", "accepted"), c("b", "pending")])).toBe("deselectAll");
    expect(bulkAction([c("a", "rejected"), c("b", "pending")])).toBe("acceptAll");
    expect(bulkAction([c("a", "rejected")])).toBeNull();
  });
});
