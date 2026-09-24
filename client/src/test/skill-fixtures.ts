/* test/skill-fixtures.ts — contract-shaped Skill / Agent rows for the Skills
   screen, the skill editor and the Agent Editor Skills tab tests. */
import type { Agent, Skill, SkillStats, SkillVersion } from "@devdigest/shared";

export function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Flag PRs that mix refactors with behaviour changes.",
    type: "rubric",
    source: "manual",
    source_ref: null,
    body: "## Rule\n\nKeep PRs focused.",
    enabled: true,
    version: 5,
    evidence_files: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    used_by: 1,
    ...overrides,
  };
}

export function makeVersion(overrides: Partial<SkillVersion> = {}): SkillVersion {
  return {
    skill_id: "sk1",
    version: 1,
    body: "## Rule\n\nKeep PRs focused.",
    description: "Flag PRs that mix refactors with behaviour changes.",
    message: "Created",
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

export function makeStats(overrides: Partial<SkillStats> = {}): SkillStats {
  return {
    skill_id: "sk1",
    window_days: 30,
    runs_attached: 0,
    runs_cited: 0,
    pull_rate: null,
    findings: 0,
    accepted: 0,
    dismissed: 0,
    accept_rate: null,
    by_category: [],
    by_severity: [],
    used_by: [],
    ...overrides,
  };
}

export const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};
