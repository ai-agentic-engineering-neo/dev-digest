import { describe, it, expect } from "vitest";
import { ApiError } from "./api";
import { isQuietError } from "./query-meta";

describe("isQuietError", () => {
  const stale = new ApiError("stale", 409, "stale_version");

  it("is loud by default", () => {
    expect(isQuietError(stale, undefined)).toBe(false);
    expect(isQuietError(stale, {})).toBe(false);
  });

  it("silences only the listed ApiError codes", () => {
    expect(isQuietError(stale, { quietErrorCodes: ["stale_version"] })).toBe(true);
    expect(isQuietError(new ApiError("dup", 409, "conflict"), { quietErrorCodes: ["stale_version"] })).toBe(false);
    expect(isQuietError(new Error("boom"), { quietErrorCodes: ["stale_version"] })).toBe(false);
  });

  it("'*' silences every error", () => {
    expect(isQuietError(new Error("boom"), { quietErrorCodes: ["*"] })).toBe(true);
  });
});
