import { describe, expect, it } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedOnly, scanAge } from "./helpers";

const NOW = Date.parse("2026-11-28T12:00:00Z");

describe("scanAge", () => {
  it("buckets minutes, hours and days", () => {
    expect(scanAge("2026-11-28T11:59:40Z", NOW)).toEqual({ key: "justNow", count: 0 });
    expect(scanAge("2026-11-28T11:41:00Z", NOW)).toEqual({ key: "minutes", count: 19 });
    expect(scanAge("2026-11-28T09:00:00Z", NOW)).toEqual({ key: "hours", count: 3 });
    expect(scanAge("2026-11-25T12:00:00Z", NOW)).toEqual({ key: "days", count: 3 });
  });
});

describe("acceptedOnly", () => {
  it("drops pending and rejected candidates", () => {
    const c = (id: string, status: ConventionCandidate["status"]) => ({ id, status }) as ConventionCandidate;
    expect(acceptedOnly([c("a", "accepted"), c("b", "rejected"), c("c", "pending")]).map((x) => x.id)).toEqual(["a"]);
  });
});
