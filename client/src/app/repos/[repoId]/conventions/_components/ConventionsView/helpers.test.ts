import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildConventionSkillDraft, confidenceColor, repoShortName, slugify } from "./helpers";

const cand = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "1",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.9,
  accepted: true,
  ...over,
});

describe("conventions helpers", () => {
  it("slugify keeps the first words, lowercased and dashed", () => {
    expect(slugify("Always use async/await instead of .then() chains")).toBe("always-use-async-await-instead");
  });

  it("repoShortName drops the owner", () => {
    expect(repoShortName("acme/payments-api")).toBe("payments-api");
    expect(repoShortName("solo")).toBe("solo");
  });

  it("confidenceColor follows the thresholds", () => {
    expect(confidenceColor(0.9)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.2)).toBe("var(--text-muted)");
  });

  it("builds a convention skill draft from accepted candidates", () => {
    const { draft, evidenceFiles } = buildConventionSkillDraft("acme/payments-api", [
      cand(),
      cand({ id: "2", rule: "Redis goes through the singleton", evidence_path: "src/lib/redis.ts", evidence_snippet: "export const redis = new Redis(url);" }),
      cand({ id: "3", rule: "Same file again", evidence_path: "src/lib/redis.ts" }),
    ]);
    expect(draft.name).toBe("payments-api-conventions");
    expect(draft.type).toBe("convention");
    expect(draft.description).toMatch(/^Apply when a diff touches payments-api code; check/);
    expect(draft.body).toContain("# payments-api-conventions");
    expect(draft.body).toContain("## always-use-async-await-instead");
    expect(draft.body).toContain("Detected in `src/api/users.ts`:");
    expect(draft.body).toContain("const user = await db.users.find(id);");
    expect(evidenceFiles).toEqual(["src/api/users.ts", "src/lib/redis.ts"]);
  });

  it("uses a longer fence when the snippet contains backticks", () => {
    const { draft } = buildConventionSkillDraft("a/b", [cand({ evidence_snippet: "const s = ```x```;" })]);
    expect(draft.body).toContain("````\nconst s = ```x```;\n````");
  });
});
