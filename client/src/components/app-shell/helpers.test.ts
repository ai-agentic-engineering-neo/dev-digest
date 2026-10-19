import { describe, it, expect } from "vitest";
import { repoSwitchHref } from "./helpers";

describe("repoSwitchHref", () => {
  it("keeps the user on Conventions, otherwise lands on the PR list", () => {
    expect(repoSwitchHref("/repos/r1/conventions", "r2")).toBe("/repos/r2/conventions");
    expect(repoSwitchHref("/repos/r1/pulls/12", "r2")).toBe("/repos/r2/pulls");
    expect(repoSwitchHref("/skills", "r2")).toBe("/repos/r2/pulls");
    expect(repoSwitchHref("/repos/r1/conventions-x", "r2")).toBe("/repos/r2/pulls");
  });
});
