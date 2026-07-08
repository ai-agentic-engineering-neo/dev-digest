import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS } from "./nav";

describe("NAV — CI Runs entry", () => {
  it("registers a keyboard-reachable CI Runs nav item pointing at /ci", () => {
    const items = NAV.flatMap((group) => group.items);
    const ciRuns = items.find((item) => item.key === "ci-runs");

    expect(ciRuns).toBeDefined();
    expect(ciRuns).toMatchObject({ label: "CI Runs", href: "/ci" });
    expect(ciRuns?.gKey).toBeTruthy();

    // The g-nav shortcut is documented in the shortcuts registry (keyboard reachability).
    expect(SHORTCUTS.some((s) => s.keys === `g ${ciRuns?.gKey}`)).toBe(true);
  });
});
