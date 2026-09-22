/* test/convention-fixtures.ts — contract-shaped Convention / ConventionScan rows
   for the Conventions screen tests. */
import type { Convention, ConventionScan, ConventionsState } from "@devdigest/shared";

export function makeConvention(overrides: Partial<Convention> = {}): Convention {
  return {
    id: "cv1",
    repo_id: "r1",
    scan_id: "scan1",
    category: "async",
    rule: "Always use async/await instead of .then() chains",
    evidence: [
      {
        path: "src/api/users.ts",
        start_line: 23,
        end_line: 24,
        snippet: "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });",
      },
    ],
    confidence: 0.91,
    status: "pending",
    edited: false,
    skill_id: null,
    created_at: "2026-09-22T10:00:00.000Z",
    updated_at: "2026-09-22T10:00:00.000Z",
    ...overrides,
  };
}

export function makeScan(overrides: Partial<ConventionScan> = {}): ConventionScan {
  return {
    id: "scan1",
    repo_id: "r1",
    status: "done",
    sampled_files: ["package.json", "tsconfig.json", "src/api/users.ts"],
    proposed: 4,
    kept: 3,
    dropped: [],
    model: "gpt-5.4",
    cost_usd: 0.012,
    error: null,
    started_at: "2026-09-22T10:00:00.000Z",
    finished_at: "2026-09-22T10:01:00.000Z",
    ...overrides,
  };
}

export function makeState(overrides: Partial<ConventionsState> = {}): ConventionsState {
  return { scan: makeScan(), conventions: [], ...overrides };
}
