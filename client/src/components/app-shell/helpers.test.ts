import { describe, it, expect } from "vitest";
import { activeKeyFor, repoSwitchTarget } from "./helpers";

describe("app-shell helpers: onboarding tour", () => {
  it("marks the tour page active and not the repo-import page (AC-3, AC-4)", () => {
    expect(activeKeyFor("/repos/abc/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/repos/abc/pulls")).toBe("pulls");
  });

  it("keeps the user on the tour when the sidebar repo changes (EC-19)", () => {
    expect(repoSwitchTarget("/repos/abc/tour", "xyz")).toBe("/repos/xyz/tour");
    expect(repoSwitchTarget("/repos/abc/pulls", "xyz")).toBe("/repos/xyz/pulls");
    expect(repoSwitchTarget("/agents", "xyz")).toBe("/repos/xyz/pulls");
  });
});
