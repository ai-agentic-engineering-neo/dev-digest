import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("multi-agent nav item", () => {
  it("is active on its route, sits right after pulls, and resolves its href", () => {
    expect(activeKeyFor("/repos/r1/multi-agent")).toBe("multi-agent");
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    const keys = workspace?.items.map((i) => i.key) ?? [];
    expect(keys.indexOf("multi-agent")).toBe(keys.indexOf("pulls") + 1);
    const item = workspace?.items.find((i) => i.key === "multi-agent");
    expect(item && resolveHref(item.href, "r1")).toBe("/repos/r1/multi-agent");
  });
});
