import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildSkillBody, evidenceFiles } from "./helpers";

const conv = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "c1",
  category: "style",
  rule: "Use async/await",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.9,
  status: "accepted",
  ...over,
});

const labels = { title: "Conventions of payments-api", evidence: "Evidence", category: (c: string) => c.toUpperCase() };

describe("buildSkillBody", () => {
  it("groups rules by category in contract order with evidence and a fenced snippet", () => {
    const body = buildSkillBody(
      [
        conv({ id: "a", category: "style" }),
        conv({ id: "b", category: "error-handling", rule: "Return Result<T, ApiError>", evidence_line: null, evidence_snippet: "" }),
      ],
      labels,
    );
    expect(body.startsWith("# Conventions of payments-api\n\n## ERROR-HANDLING")).toBe(true);
    expect(body.indexOf("## ERROR-HANDLING")).toBeLessThan(body.indexOf("## STYLE"));
    expect(body).toContain("- **Return Result<T, ApiError>**\n  Evidence: `src/api/users.ts`");
    expect(body).toContain("  Evidence: `src/api/users.ts:23`\n  ```\n  const user = await db.users.find(id);\n  ```");
  });

  it("renders only the title for no rules", () => {
    expect(buildSkillBody([], labels)).toBe("# Conventions of payments-api\n");
  });
});

describe("evidenceFiles", () => {
  it("dedupes paths in first-seen order", () => {
    expect(
      evidenceFiles([conv({ evidence_path: "b.ts" }), conv({ evidence_path: "a.ts" }), conv({ evidence_path: "b.ts" })]),
    ).toEqual(["b.ts", "a.ts"]);
  });
});
