import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { needsVetting } from "./helpers";

const sk = (extra: Partial<Skill>): Skill => ({
  id: "s", name: "n", description: "", type: "custom", source: "manual", body: "b", enabled: true, version: 1, evidence_files: null, agent_count: 0, ...extra,
});

describe("needsVetting", () => {
  it("is true only for a non-manual skill that is still disabled", () => {
    expect(needsVetting(sk({ source: "imported_file", enabled: false }))).toBe(true);
    expect(needsVetting(sk({ source: "imported_file", enabled: true }))).toBe(false);
    expect(needsVetting(sk({ source: "manual", enabled: false }))).toBe(false);
  });
});
