import { describe, it, expect } from "vitest";
import { makeConvention } from "@/test/convention-fixtures";
import { buildSkillDraft, defaultSkillName, fenceLang, ruleSlug, slugify, uniqueSlugs } from "./helpers";

describe("buildSkillDraft", () => {
  it("renders the title, intro and one section per rule with its primary evidence", () => {
    const draft = buildSkillDraft("payments-api-conventions", "payments-api", [
      makeConvention(),
      makeConvention({
        id: "cv2",
        category: "data-access",
        rule: "Redis access goes through src/lib/redis.ts singleton",
        evidence: [
          { path: "src/lib/redis.ts", start_line: 1, end_line: 1, snippet: "export const redis = new Redis(config.redisUrl);" },
          { path: "src/jobs/cache.ts", start_line: 4, end_line: 4, snippet: "import { redis } from '../lib/redis';" },
        ],
      }),
    ]);
    expect(draft).toBe(
      [
        "# payments-api-conventions",
        "",
        "House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
        "",
        "## async: always-use-async-await-instead-of",
        "Always use async/await instead of .then() chains",
        "",
        "Detected in `src/api/users.ts:23-24`:",
        "```ts",
        "const user = await db.users.find(id);",
        "const posts = await db.posts.findMany({ userId });",
        "```",
        "",
        "## data-access: redis-access-goes-through-src-lib-redis-ts",
        "Redis access goes through src/lib/redis.ts singleton",
        "",
        "Detected in `src/lib/redis.ts:1`:",
        "```ts",
        "export const redis = new Redis(config.redisUrl);",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("uses a longer fence when the snippet contains backticks", () => {
    const draft = buildSkillDraft("x", "repo", [
      makeConvention({ evidence: [{ path: "README.md", start_line: 2, end_line: 4, snippet: "```sh\npnpm i\n```" }] }),
    ]);
    expect(draft).toContain("````md\n```sh\npnpm i\n```\n````");
  });

  it("a rule without evidence gets no Detected block", () => {
    const draft = buildSkillDraft("x", "repo", [makeConvention({ evidence: [] })]);
    expect(draft).not.toContain("Detected in");
  });
});

describe("naming helpers", () => {
  it("slugifies to the contract slug rule", () => {
    expect(slugify("  Payments_API v2!! ")).toBe("payments-api-v2");
    expect(slugify("a".repeat(80))).toHaveLength(64);
  });

  it("default name is the fixed `repo-conventions` slug", () => {
    expect(defaultSkillName()).toBe("repo-conventions");
  });

  it("rule slug takes the first words", () => {
    expect(ruleSlug("Always use async/await instead of .then() chains")).toBe("always-use-async-await-instead-of");
    expect(ruleSlug("!!!")).toBe("rule");
  });

  it("maps the extension to a fence language", () => {
    expect(fenceLang("src/a.tsx")).toBe("tsx");
    expect(fenceLang("pyproject.toml")).toBe("toml");
    expect(fenceLang("Makefile")).toBe("");
    expect(fenceLang("x.unknown")).toBe("");
  });
});

describe("uniqueSlugs", () => {
  it("suffixes repeated heading slugs", () => {
    expect(uniqueSlugs(["a", "b", "a", "a"])).toEqual(["a", "b", "a-2", "a-3"]);
  });
});
