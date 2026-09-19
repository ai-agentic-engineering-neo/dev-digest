import { describe, it, expect } from "vitest";
import { arrayBufferToBase64 } from "./helpers";

describe("arrayBufferToBase64", () => {
  it("encodes bytes the same way atob would decode them", () => {
    const bytes = new TextEncoder().encode("# Rule\nDo the thing.");
    const b64 = arrayBufferToBase64(bytes.buffer);
    expect(atob(b64)).toBe("# Rule\nDo the thing.");
  });

  it("round-trips an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });
});
