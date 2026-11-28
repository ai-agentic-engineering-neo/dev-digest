import { describe, it, expect } from "vitest";
import { reviewRunDomId } from "./helpers";

describe("reviewRunDomId", () => {
  it("prefixes the run id so it can be used as a DOM id", () => {
    expect(reviewRunDomId("abc")).toBe("review-run-abc");
  });
});
