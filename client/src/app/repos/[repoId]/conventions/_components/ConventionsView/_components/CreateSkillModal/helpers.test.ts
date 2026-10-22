import { describe, it, expect } from "vitest";
import { renderConventionsSkillBodyPreview, suggestSkillName } from "./helpers";

const ASYNC = {
  category: "async-await-only",
  rule: "Always use async/await instead of .then() chains.",
  evidence_path: "src/api/users.ts",
  evidence_start_line: 23,
  evidence_end_line: 24,
  evidence_snippet: "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });",
};

describe("suggestSkillName", () => {
  it("slugs the repo name and falls back when empty", () => {
    expect(suggestSkillName("payments-api")).toBe("payments-api-conventions");
    expect(suggestSkillName("My Repo.js")).toBe("my-repo-js-conventions");
    expect(suggestSkillName(undefined)).toBe("repo-conventions");
  });
});

describe("renderConventionsSkillBodyPreview", () => {
  // Same expected text as server/test/conventions-helpers.test.ts — the two renderers must agree.
  it("matches the server's default body format", () => {
    expect(renderConventionsSkillBodyPreview("payments-api-conventions", "payments-api", [ASYNC])).toBe(
      [
        "# payments-api-conventions",
        "House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
        "## async-await-only",
        "Always use async/await instead of .then() chains.",
        "Detected in `src/api/users.ts:23-24`:\n```\nconst user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });\n```",
      ].join("\n\n"),
    );
  });

  it("uses a longer fence when the snippet contains backticks", () => {
    const body = renderConventionsSkillBodyPreview("x", "r", [{ ...ASYNC, evidence_snippet: "const s = ```;" }]);
    expect(body).toContain("````\nconst s = ```;\n````");
  });
});
