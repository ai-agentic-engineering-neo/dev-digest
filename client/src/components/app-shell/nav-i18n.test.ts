import { describe, expect, it } from "vitest";
import { NAV } from "@devdigest/ui/nav";
import shell from "../../../messages/en/shell.json";

// Every sidebar item resolves its label as `shell.nav.<key>`. A key added to
// vendor/ui/nav.ts without a messages entry throws MISSING_MESSAGE at runtime,
// but shell tests stub the nav, so only a real page load showed it (SPEC-18
// "Graph" tab). This pins the two files together.
describe("sidebar nav ↔ shell.json", () => {
  it("has a shell.nav label for every NAV item", () => {
    const labels = shell.nav as Record<string, string>;
    const missing = NAV.flatMap((g) => g.items.map((i) => i.key)).filter((k) => !labels[k]);
    expect(missing).toEqual([]);
  });
});
