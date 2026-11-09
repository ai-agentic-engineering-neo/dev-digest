import { describe, it, expect } from "vitest";
import { githubBlobUrl } from "@/lib/github-urls";
import { fileLocation, briefRefHref } from "./helpers";

describe("fileLocation", () => {
  it("appends the line only when known", () => {
    expect(fileLocation("src/a.ts", 12)).toBe("src/a.ts:12");
    expect(fileLocation("src/a.ts", null)).toBe("src/a.ts");
  });
});

describe("briefRefHref", () => {
  it("builds a pinned GitHub URL, or null without repo or sha", () => {
    expect(briefRefHref("lib/b.ts", 12, "acme/app", "idx1")).toBe(githubBlobUrl("acme/app", "idx1", "lib/b.ts", 12));
    expect(briefRefHref("lib/b.ts", null, "acme/app", "idx1")).toBe(githubBlobUrl("acme/app", "idx1", "lib/b.ts"));
    expect(briefRefHref("lib/b.ts", 12, null, "idx1")).toBeNull();
    expect(briefRefHref("lib/b.ts", 12, "acme/app", null)).toBeNull();
  });
});
