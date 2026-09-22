import { describe, it, expect } from "vitest";
import { toolCallKeys } from "./helpers";

describe("toolCallKeys", () => {
  it("keys by tool + args and suffixes only repeated identical calls", () => {
    expect(
      toolCallKeys([
        { tool: "read", args: "a.ts" },
        { tool: "read", args: "b.ts" },
        { tool: "read", args: "a.ts" },
      ]),
    ).toEqual(["read(a.ts)", "read(b.ts)", "read(a.ts)#1"]);
  });

  it("keeps earlier keys stable when a call is appended", () => {
    const calls = [{ tool: "grep", args: "x" }];
    expect(toolCallKeys([...calls, { tool: "grep", args: "x" }]).slice(0, 1)).toEqual(toolCallKeys(calls));
  });
});
