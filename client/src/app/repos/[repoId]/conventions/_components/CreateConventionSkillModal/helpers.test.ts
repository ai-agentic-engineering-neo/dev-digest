import { describe, expect, it } from "vitest";
import { buildSkillBody, canSaveSkillDraft } from "./helpers";

const text = { intro: "Flag violations.", detectedIn: (loc: string) => `Detected in \`${loc}\`.` };

describe("buildSkillBody", () => {
  it("groups the given candidates by category", () => {
    const body = buildSkillBody(
      "repo-conventions",
      [
        { category: "error handling", rule: "Surface API errors via toast" },
        { category: null, rule: "Use async/await" },
        { category: "error handling", rule: "Never swallow errors" },
      ],
      ["a.ts:1-2", "b.ts:3", "c.ts:4"],
      text,
    );
    expect(body).toBe(
      [
        "# repo-conventions",
        "Flag violations.",
        "## error handling\nSurface API errors via toast\nDetected in `a.ts:1-2`.\n\nNever swallow errors\nDetected in `c.ts:4`.",
        "## general\nUse async/await\nDetected in `b.ts:3`.",
      ].join("\n\n") + "\n",
    );
  });
});

describe("canSaveSkillDraft", () => {
  it("needs a slug name, a description and a body", () => {
    const ok = { name: "repo-conventions", description: "d", body: "b", enabled: false };
    expect(canSaveSkillDraft(ok)).toBe(true);
    expect(canSaveSkillDraft({ ...ok, name: "Repo Conventions" })).toBe(false);
    expect(canSaveSkillDraft({ ...ok, description: "  " })).toBe(false);
  });
});
