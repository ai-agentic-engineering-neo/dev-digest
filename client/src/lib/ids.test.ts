import { describe, it, expect } from "vitest";
import { isUuid, repoPath } from "./ids";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("isUuid", () => {
  it("accepts uuids only", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    for (const bad of [null, undefined, "", "r1", "..", "../repos/x", `${ID}/..`, `${ID}?x=1`]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe("repoPath", () => {
  it("builds the repo API path for a uuid", () => {
    expect(repoPath(ID)).toBe(`/repos/${ID}`);
  });

  it("throws instead of building a path from a non-uuid (no ../ traversal)", () => {
    expect(() => repoPath("..")).toThrow("Invalid repository id");
    expect(() => repoPath("../pulls")).toThrow();
    expect(() => repoPath(null)).toThrow();
  });
});
