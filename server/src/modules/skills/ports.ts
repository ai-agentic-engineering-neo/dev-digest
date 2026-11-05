import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { PromptSkill, SkillContent } from './domain.js';

/** A recorded body snapshot of a skill (skill_versions). */
export interface SkillVersionRecord {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export interface NewSkill extends SkillContent {
  workspaceId: string;
  source: SkillSource;
  enabled?: boolean;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
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
}
