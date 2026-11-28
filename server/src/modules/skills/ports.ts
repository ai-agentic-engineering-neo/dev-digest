import type { Skill, SkillSource, SkillVersion } from '@devdigest/shared';
import type { ArchiveEntry, EffectiveSkill, SkillContent } from './domain.js';

/**
 * M2 — what SkillsService needs from the outside world. `routes.ts` wires the
 * real implementations; tests pass in-memory fakes.
 */

export type { ArchiveEntry, EffectiveSkill, SkillContent };

/** A skill as stored: everything but the counts the service adds (`agent_count`, `token_count`). */
export type StoredSkill = Omit<Skill, 'agent_count' | 'token_count'>;

/** Name, type and global flag of a skill: what the agents module shows on a link. */
export type SkillSummary = Pick<Skill, 'id' | 'name' | 'type' | 'enabled'>;

export interface NewSkill extends SkillContent {
  workspaceId: string;
  source: SkillSource;
  enabled?: boolean;
}

/** Persistence for skills and their version history. Workspace-scoped. */
export interface SkillStore {
  /** The workspace's skills, oldest first. */
  list(workspaceId: string): Promise<StoredSkill[]>;
  getById(workspaceId: string, id: string): Promise<StoredSkill | undefined>;
  /** True when another skill of the workspace already has this name. */
  nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean>;
  /** Insert the skill at v1 and its v1 version row (note null), in one transaction. */
  insert(values: NewSkill): Promise<StoredSkill>;
  /**
   * Write `content` onto the skill, bump its version and `updated_at`, and
   * insert the new version row with `note`, in one transaction. A collision
   * on (skill_id, version) surfaces. Undefined when the skill is gone.
   */
  bumpAndSnapshot(
    workspaceId: string,
    id: string,
    content: SkillContent,
    note: string | null,
    enabled?: boolean,
  ): Promise<StoredSkill | undefined>;
  /** Toggle the global flag; writes no version. */
  setEnabled(workspaceId: string, id: string, enabled: boolean): Promise<StoredSkill | undefined>;
  /** False when no such skill existed. Versions and links cascade. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Version rows, newest first. */
  listVersions(skillId: string): Promise<SkillVersion[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersion | undefined>;
  /** The globally enabled skills among `ids`, as prompt content (any order). */
  enabledByIds(ids: readonly string[]): Promise<EffectiveSkill[]>;
}

/** Agent links, owned by the agents module. */
export interface AgentLinks {
  /** Per skill id, the number of agents linking it with the link enabled. */
  enabledLinkCounts(skillIds: readonly string[]): Promise<Map<string, number>>;
  /** Skill ids linked to the agent with the link enabled, in link order. */
  enabledSkillIds(agentId: string): Promise<string[]>;
}

/** Counts tokens of a text (the tokenizer adapter's `count`). */
export interface TokenCounter {
  count(text: string): number;
}

/**
 * Reads a zip in memory. `list` reads the directory and inflates nothing;
 * `inflate` decompresses one entry. Throws on a malformed archive.
 */
export interface ArchiveReader {
  list(data: Uint8Array): ArchiveEntry[];
  inflate(data: Uint8Array, path: string): Uint8Array;
}

/** Parses a YAML frontmatter block (core schema, no custom tags). Throws on invalid YAML. */
export interface FrontmatterParser {
  parse(yaml: string): unknown;
}
