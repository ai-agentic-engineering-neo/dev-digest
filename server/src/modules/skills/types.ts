import type { SkillSource, SkillType } from '@devdigest/shared';
import type { ArchiveReader } from '../../adapters/archive/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';

/**
 * Skills module — domain types and ports (rings 1–2). No Drizzle, no Fastify:
 * the service depends only on these; `repository.ts` implements the port.
 */

/** A persisted skill (domain shape, not the DB row). */
export interface SkillRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersionRecord {
  version: number;
  body: string;
  changeNote: string | null;
  createdAt: Date;
}

export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  changeNote: string;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  enabled?: boolean;
  /** A new body ALWAYS creates a new version snapshot. */
  body?: { text: string; changeNote: string | null };
}

/** Card + Stats numbers for one skill (30-day window). */
export interface SkillUsageSummary {
  skillId: string;
  agentsCount: number;
  runsWithSkill: number;
  /** Runs (same window) of every agent that has or had this skill. */
  agentRuns: number;
  findings: number;
  accepted: number;
  dismissed: number;
}

export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<SkillRecord[]>;
  get(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  getByName(workspaceId: string, name: string): Promise<SkillRecord | undefined>;
  /** Insert the skill AND its v1 snapshot atomically. */
  insert(skill: NewSkill): Promise<SkillRecord>;
  /** Apply a patch; a body change bumps the version and snapshots it. */
  update(workspaceId: string, id: string, patch: SkillPatch): Promise<SkillRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined>;
  usageSummaries(workspaceId: string, since: Date, skillId?: string): Promise<SkillUsageSummary[]>;
  usedBy(skillId: string): Promise<{ agentId: string; name: string }[]>;
  findingsByCategory(skillId: string, since: Date): Promise<{ category: string; count: number }[]>;
}

export interface SkillsServiceDeps {
  skills: SkillsRepositoryPort;
  archive: ArchiveReader;
  tokenizer: Tokenizer;
  /** Injectable clock (stats window). */
  now?: () => Date;
}
