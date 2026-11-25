import { describe, it, expect } from "vitest";
import { toolCallKeys } from "./helpers";

describe("toolCallKeys", () => {
  it("keys a call by its tool and args", () => {
    expect(
      toolCallKeys([
        { tool: "read_file", args: "a.ts" },
        { tool: "grep", args: "foo" },
      ]),
    ).toEqual(["read_file(a.ts)", "grep(foo)"]);
  });

  it("suffixes identical repeated calls instead of producing a duplicate key", () => {
    const call = { tool: "read_file", args: "a.ts" };
    expect(toolCallKeys([call, { tool: "grep", args: "x" }, call, call])).toEqual([
      "read_file(a.ts)",
      "grep(x)",
      "read_file(a.ts)#1",
      "read_file(a.ts)#2",
    ]);
  });

  it("treats the same tool with different args as different calls", () => {
    expect(
      toolCallKeys([
        { tool: "read_file", args: "a.ts" },
        { tool: "read_file", args: "b.ts" },
      ]),
    ).toEqual(["read_file(a.ts)", "read_file(b.ts)"]);
  });
});
