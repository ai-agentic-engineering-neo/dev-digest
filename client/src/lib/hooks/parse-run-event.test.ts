import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRunEvent } from "./parse-run-event";

const valid = { runId: "run-1", seq: 3, kind: "tool", msg: "read_file a.ts", t: "00.31" };

describe("parseRunEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a valid RunEvent unchanged", () => {
    expect(parseRunEvent(JSON.stringify(valid))).toEqual(valid);
    const withData = { ...valid, data: { x: 1 } };
    expect(parseRunEvent(JSON.stringify(withData))).toEqual(withData);
  });

  it("skips non-JSON keepalive and dataless frames silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseRunEvent(": keepalive")).toBeNull();
    expect(parseRunEvent("")).toBeNull();
    expect(parseRunEvent(undefined)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips a contract-violating event without throwing and warns in dev", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => parseRunEvent(JSON.stringify({ ...valid, kind: "bogus" }))).not.toThrow();
    expect(parseRunEvent(JSON.stringify({ ...valid, kind: "bogus" }))).toBeNull();
    expect(parseRunEvent(JSON.stringify({ runId: "run-1" }))).toBeNull();
    expect(parseRunEvent("null")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
