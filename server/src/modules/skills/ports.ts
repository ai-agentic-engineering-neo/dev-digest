import type { SkillSource, SkillType } from '@devdigest/shared';

/** Read model the skills service works with — NOT a Drizzle row. */
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

export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  message: string | null;
  createdAt: Date;
}

/** Per-skill usage counters behind the list card footer. */
export interface SkillUsage {
  /** Agents with an enabled link to the skill. */
  agents: number;
  /** Completed runs of those agents. */
  agentRuns: number;
  /** Completed runs whose prompt included the skill (trace `skills_detail`). */
  pulledRuns: number;
  accepted: number;
  dismissed: number;
}

/** Stats-tab detail for one skill. */
export interface SkillUsageDetail extends SkillUsage {
  agentList: { id: string; name: string; enabled: boolean }[];
  findings30d: number;
  byCategory: { category: string; count: number }[];
}

export type NewSkill = Pick<
  SkillRecord,
  'workspaceId' | 'name' | 'description' | 'type' | 'source' | 'body' | 'enabled'
> &
  Partial<Pick<SkillRecord, 'evidenceFiles'>>;

export type SkillPatch = Partial<Pick<SkillRecord, 'name' | 'description' | 'type' | 'body' | 'enabled'>>;

export interface SkillStore {
  list(workspaceId: string): Promise<SkillRecord[]>;
  get(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  findByName(workspaceId: string, name: string): Promise<SkillRecord | undefined>;
  /** Inserts the skill AND its version-1 snapshot atomically. */
  insert(skill: NewSkill): Promise<SkillRecord>;
  /**
   * Applies the patch; when `newVersion` is set, bumps `version` and records
   * the immutable `skill_versions` row (body + change note) in the same transaction.
   */
  update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    newVersion?: { body: string; message: string | null },
  ): Promise<SkillRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  /** skillId → usage counters for every skill of the workspace that has any. */
  usage(workspaceId: string): Promise<Map<string, SkillUsage>>;
  /** Usage counters + linked agents + 30-day findings breakdown for one skill. */
  usageDetail(workspaceId: string, skillId: string): Promise<SkillUsageDetail>;
}

/** One file inside an uploaded archive (decompressed lazily, bounded). */
export interface ArchiveEntry {
  path: string;
  isDirectory: boolean;
  size: number;
  read(): Uint8Array;
}

export interface ArchiveReader {
  /** Lists entries without inflating them; throws on limit / format errors. */
  list(
    data: Uint8Array,
    limits: { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number },
  ): ArchiveEntry[];
}
