/** Test fixtures for the Skills feature (imported by *.test.tsx only). */
import type { Skill } from "@devdigest/shared";

export function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "secret-leakage-gate",
    description: "Block diffs that add credentials",
    type: "security",
    source: "manual",
    body: "# Secrets\nFlag any added credential.",
    enabled: true,
    version: 2,
    evidence_files: null,
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-20T10:00:00.000Z",
    agent_count: 3,
    ...overrides,
  };
}
