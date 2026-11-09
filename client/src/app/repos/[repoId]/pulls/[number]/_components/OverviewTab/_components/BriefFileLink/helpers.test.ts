import { describe, it, expect } from "vitest";
import { fileLocation } from "./helpers";

describe("fileLocation", () => {
  it("appends the line only when known", () => {
    expect(fileLocation("src/a.ts", 12)).toBe("src/a.ts:12");
    expect(fileLocation("src/a.ts", null)).toBe("src/a.ts");
  });
});
