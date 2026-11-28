import { describe, it, expect } from "vitest";
import type { SkillVersion } from "@devdigest/shared";
import { isCurrentVersion, isoDate, newestFirst } from "./helpers";

const v = (version: number): SkillVersion => ({
  version,
  name: "n",
  description: "d",
  type: "custom",
  body: "b",
  note: null,
  created_at: "2026-05-30T10:00:00.000Z",
});

describe("VersionsTab helpers", () => {
  it("formats the date as YYYY-MM-DD", () => {
    expect(isoDate("2026-05-30T10:00:00.000Z")).toBe("2026-05-30");
  });

  it("detects the current version", () => {
    expect(isCurrentVersion(v(5), { version: 5 })).toBe(true);
    expect(isCurrentVersion(v(4), { version: 5 })).toBe(false);
  });

  it("orders newest first", () => {
    expect(newestFirst([v(1), v(3), v(2)]).map((x) => x.version)).toEqual([3, 2, 1]);
  });
});
