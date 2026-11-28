import { describe, it, expect } from "vitest";
import { createToastDeduper } from "./toast-dedupe";

describe("createToastDeduper", () => {
  it("drops an identical toast inside the window and shows it again after", () => {
    let now = 0;
    const accept = createToastDeduper(4000, () => now);
    expect(accept("error", "boom")).toBe(true);
    now = 1000;
    expect(accept("error", "boom")).toBe(false);
    expect(accept("error", "other")).toBe(true);
    now = 5000;
    expect(accept("error", "boom")).toBe(true);
  });
});
