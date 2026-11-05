import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { PromptSkill, SkillContent, SkillStatsData } from './domain.js';

/** A recorded body snapshot of a skill (skill_versions). */
export interface SkillVersionRecord {
  skill_id: string;
  version: number;
  body: string;
  note: string | null;
  created_at: string;
}

export interface NewSkill extends SkillContent {
  workspaceId: string;
  source: SkillSource;
  enabled?: boolean;
  /** Files the skill was derived from (conventions extractor), shown as provenance. */
  evidenceFiles?: string[] | null;
  /** Note for the v1 row (default "Initial version"). */
  note?: string;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** "What changed" — stored on the version row a content change creates. */
  note?: string;
}

/** What the skills service needs from storage. Every call is workspace-scoped. */
export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<Skill[]>;
  getById(workspaceId: string, id: string): Promise<Skill | undefined>;
  getByName(workspaceId: string, name: string): Promise<Skill | undefined>;
  /** Insert + record version 1 in skill_versions. */
  insert(values: NewSkill): Promise<Skill>;
  /** Update; a content change bumps the version and snapshots the body. */
  update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill | undefined>;
  /** Delete (agent links cascade). False when absent from the workspace. */
  delete(workspaceId: string, id: string): Promise<boolean>;
  listVersions(workspaceId: string, id: string): Promise<SkillVersionRecord[] | undefined>;
  /** Enabled skills linked to an agent, in link order (for prompt assembly). */
  promptSkillsForAgent(workspaceId: string, agentId: string): Promise<PromptSkill[]>;
  /** Number of agents each skill is linked to (skill id → count). */
  linkCounts(workspaceId: string): Promise<Record<string, number>>;
  /** Record which skills (and versions) went into a run's prompt, in prompt order. */
  recordRunSkills(runId: string, skills: { id: string; version: number }[]): Promise<void>;
  /** Raw rows for stats: workspace runs since `since`, their skills/findings, current links. */
  statsData(workspaceId: string, since: Date): Promise<SkillStatsData>;
  /** Agents linked to a skill now (id + name), by name. */
  linkedAgents(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]>;
}
