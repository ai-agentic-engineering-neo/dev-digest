import { describe, it, expect } from "vitest";
import { VALID_TABS } from "./constants";
import { TABS } from "../AgentEditor/constants";

// Regression test for a real bug found via manual walkthrough
// (specs/16-agent-performance-dashboard.md): AgentEditor/constants.ts's TABS
// drives the tab bar, VALID_TABS here gates ?tab= — they drifted (this
// file's own header comment already warned this had happened once for
// "skills"), leaving the newly-built Stats tab completely unreachable:
// clicking it, or opening its ?tab=stats link from the dashboard, silently
// fell back to the Config tab with no error.
describe("VALID_TABS", () => {
  it("includes every key AgentEditor/constants.ts's TABS renders", () => {
    for (const t of TABS) {
      expect(VALID_TABS as readonly string[]).toContain(t.key);
    }
  });
});
