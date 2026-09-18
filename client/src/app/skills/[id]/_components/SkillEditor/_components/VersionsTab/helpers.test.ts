import { describe, it, expect } from "vitest";
import { diffBodies } from "./helpers";

describe("diffBodies", () => {
  it("marks a changed line as removed then added", () => {
    const diff = diffBodies("hello\nworld", "hello\nthere");
    expect(diff).toContain("  hello");
    expect(diff).toContain("- world");
    expect(diff).toContain("+ there");
  });

  it("is empty-prefix identical when both sides match", () => {
    expect(diffBodies("same", "same")).toBe("  same");
  });
});
