import { describe, it, expect } from "vitest";
import { splitChips } from "./helpers";

describe("splitChips", () => {
  it("splits only when items exceed max", () => {
    expect(splitChips([], 2)).toEqual({ shown: [], hidden: 0 });
    expect(splitChips(["a", "b"], 2)).toEqual({ shown: ["a", "b"], hidden: 0 });
    expect(splitChips(["a", "b", "c", "d"], 2)).toEqual({ shown: ["a", "b"], hidden: 2 });
  });
});
