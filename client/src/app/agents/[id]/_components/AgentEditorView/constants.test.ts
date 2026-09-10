import { describe, it, expect } from "vitest";
import { TABS } from "../AgentEditor/constants";
import { VALID_TABS, DEFAULT_TAB } from "./constants";

/* Regression: `?tab=ci` silently fell back to Config because VALID_TABS was a
   hand-maintained copy of TABS that never gained the `ci` key (the same drift
   had already happened for `skills`). The guard is now derived from TABS. */
describe("agent editor ?tab= guard", () => {
  it("accepts every tab the tab bar renders", () => {
    expect(VALID_TABS).toEqual(TABS.map((t) => t.key));
  });

  it("accepts the CI tab", () => {
    expect(VALID_TABS).toContain("ci");
  });

  it("defaults to the first tab", () => {
    expect(DEFAULT_TAB).toBe("config");
  });
});
