import { describe, it, expect } from "vitest";
import { approxTokens, formatApproxTokens, toolCallKeys } from "./helpers";

describe("approxTokens", () => {
  it("counts a block's own text at chars / 4, rounded up (server's estimate)", () => {
    expect(approxTokens("### skill")).toBe(3); // 9 chars
    expect(approxTokens("You are a reviewer.")).toBe(5); // 19 chars
    expect(approxTokens("a".repeat(4000))).toBe(1000);
  });

  it("treats an empty or absent block as zero", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens(null)).toBe(0);
    expect(approxTokens(undefined)).toBe(0);
  });
});

describe("formatApproxTokens", () => {
  it("shows exact counts below 1k and one decimal above", () => {
    expect(formatApproxTokens(187)).toBe("187");
    expect(formatApproxTokens(999)).toBe("999");
    expect(formatApproxTokens(1000)).toBe("1.0k");
    expect(formatApproxTokens(1234)).toBe("1.2k");
  });
});

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
