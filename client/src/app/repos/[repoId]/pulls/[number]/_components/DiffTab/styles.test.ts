/* Regression for the sticky RoleGroup header (client/INSIGHTS.md): a sticky
   element only sticks to the nearest scrolling ancestor. `roleGroup` is the
   header's direct parent — if it (or `roleBody`) sets `overflow: hidden`, it
   becomes that ancestor and the header scrolls away with the group instead of
   sticking to `<main overflow:auto>`. */
import { describe, it, expect } from "vitest";
import { s } from "./styles";

describe("DiffTab sticky header ancestors", () => {
  it("roleGroup and roleBody never clip overflow", () => {
    expect(s.roleGroup).not.toHaveProperty("overflow");
    expect(s.roleBody).not.toHaveProperty("overflow");
  });

  it("roleHeader stays sticky regardless of open state", () => {
    expect(s.roleHeader.position).toBe("sticky");
  });
});
