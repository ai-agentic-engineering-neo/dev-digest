import { describe, expect, it } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("AC-39/D10 — highlights the Onboarding Tour entry for the tour route, and leaves it unhighlighted on the add-a-repo screen", () => {
    expect(activeKeyFor("/repos/repo-1/tour")).toBe("onboarding-tour");
    // The bug this fixes: `.includes("/onboarding")` also matched the
    // unrelated add-a-repo screen, which shares no URL segment with the tour.
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("does not false-positive on a path that merely contains \"tour\" as a substring, not a segment", () => {
    expect(activeKeyFor("/repos/repo-1/detour")).not.toBe("onboarding-tour");
  });

  it("still resolves the other existing routes unchanged", () => {
    expect(activeKeyFor("/repos/repo-1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/repo-1/context")).toBe("context");
    expect(activeKeyFor("/repos/repo-1/conventions")).toBe("conventions");
    expect(activeKeyFor("/settings/api-keys")).toBe("settings");
    expect(activeKeyFor("/skills")).toBe("skills");
    expect(activeKeyFor("/agents")).toBe("agents");
    expect(activeKeyFor("/unknown-route")).toBe("");
  });
});
