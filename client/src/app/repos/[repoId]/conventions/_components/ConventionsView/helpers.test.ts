import { describe, it, expect } from "vitest";
import { agoParts } from "./helpers";

describe("agoParts", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  it("buckets elapsed time", () => {
    expect(agoParts("2026-10-19T11:59:50Z", now)).toEqual({ unit: "now" });
    expect(agoParts("2026-10-19T11:15:00Z", now)).toEqual({ unit: "m", n: 45 });
    expect(agoParts("2026-10-19T11:00:00Z", now)).toEqual({ unit: "h", n: 1 });
    expect(agoParts("2026-10-17T12:00:00Z", now)).toEqual({ unit: "d", n: 2 });
    expect(agoParts(null, now)).toBeNull();
    expect(agoParts("garbage", now)).toBeNull();
  });
});
