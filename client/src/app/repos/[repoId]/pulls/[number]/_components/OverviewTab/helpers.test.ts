import { describe, it, expect } from "vitest";
import { formatFocusRef, parseRef } from "./helpers";

describe("OverviewTab helpers", () => {
  it("parseRef reads path, path:line and path:start-end (start wins)", () => {
    expect(parseRef("src/a.ts")).toEqual({ path: "src/a.ts", line: null });
    expect(parseRef("src/a.ts:12")).toEqual({ path: "src/a.ts", line: 12 });
    expect(parseRef("src/a.ts:12-20")).toEqual({ path: "src/a.ts", line: 12 });
  });

  it("formatFocusRef omits a missing line", () => {
    expect(formatFocusRef({ path: "a.ts", line: 3 })).toBe("a.ts:3");
    expect(formatFocusRef({ path: "a.ts", line: null })).toBe("a.ts");
  });
});
