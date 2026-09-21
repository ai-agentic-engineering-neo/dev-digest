import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Ports + domain shapes for the skills module (ring 2). The service depends on
 * `SkillsStore`, never on the concrete Drizzle repository, so it can be unit-tested
 * with a fake. Drizzle rows are structurally assignable to these records.
 */

/** A persisted skill (camelCase domain shape). */
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
}

/** One immutable body snapshot. */
export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** Raw (un-divided) usage numbers for one skill; rates are derived in helpers. */
export interface SkillUsageCounts {
  /** Distinct agents currently linking the skill. */
  usedBy: number;
  /** Agents currently linking the skill, sorted by name. */
  agentsUsing: { id: string; name: string }[];
  /** Runs (done, by agents that currently link it) in which the skill was pulled in. */
  pulledRuns: number;
  /** Done runs by agents that currently link the skill. */
  eligibleRuns: number;
  /** Findings accepted, over runs where the skill was active. */
  accepted: number;
  /** Findings accepted OR dismissed, over runs where the skill was active. */
  decided: number;
  /** Findings from reviews created in the last 30 days. */
  findings30d: number;
  /** category -> summed run cost (USD), over distinct runs. Sorted by cost desc. */
  findingsByCategory: { category: string; cost_usd: number }[];
}

/** Persistence port for skills. All reads/writes are workspace-scoped. */
export interface SkillsStore {
  list(workspaceId: string): Promise<SkillRecord[]>;
  getById(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  insert(values: InsertSkill): Promise<SkillRecord>;
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRecord | undefined>;
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined>;
  /** Batched usage counts for many skills (fixed number of queries, no N+1). */
  statsForSkills(skillIds: string[]): Promise<Map<string, SkillUsageCounts>>;
}

/** Explicit dependencies of `SkillsService`. */
export interface SkillsDeps {
  repo: SkillsStore;
}
