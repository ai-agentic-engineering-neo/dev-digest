import type {
  Skill,
  SkillListItem,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import type { SkillsDeps, SkillsStore } from './types.js';
import {
  EMPTY_USAGE,
  toRates,
  toSkillDto,
  toSkillStatsDto,
  toSkillVersionDto,
} from './helpers.js';

/**
 * Skills service. A skill is a reusable, editable prompt block that agents link
 * to (`agent_skills`). Body edits are versioned in `skill_versions` (repository).
 * Every method is workspace-scoped; `undefined` means "not in this workspace"
 * and the route maps it to 404.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: Extract<SkillSource, 'manual' | 'extracted'>;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsStore;

  constructor(deps: SkillsDeps) {
    this.repo = deps.repo;
  }

  /** All skills in the workspace with usage aggregates (one batched stats pass). */
  async list(workspaceId: string): Promise<SkillListItem[]> {
    const rows = await this.repo.list(workspaceId);
    const stats = await this.repo.statsForSkills(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...toSkillDto(row),
      ...toRates(stats.get(row.id) ?? EMPTY_USAGE),
    }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (versions/agent links/run links go with it, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Create a skill (also snapshots v1). Both manual creation and file import
   * (`source: 'extracted'`) start enabled — "needs vetting" is a UI hint, not a gate.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      body: input.body,
      source: input.source ?? 'manual',
      enabled: input.enabled ?? true,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Body history, newest first. undefined when the skill isn't in this workspace. */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /** One snapshot. undefined when the skill isn't in this workspace OR the version is unknown. */
  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** Stats-tab numbers. undefined when the skill isn't in this workspace. */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const stats = await this.repo.statsForSkills([skillId]);
    return toSkillStatsDto(stats.get(skillId) ?? EMPTY_USAGE);
  }
}
