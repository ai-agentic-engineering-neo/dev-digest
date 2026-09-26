import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillTypeItem,
  SkillVersion,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { isBodyChange, parseMarkdownSkill, toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills service (ring ②) — business logic for the Skills page and the Skill
 * editor. Imports neither fastify nor drizzle nor db/schema.
 *
 * A skill is a named, typed, versioned markdown block that many agents can
 * share. It is TEXT and nothing else: it carries no executable part and no tool
 * access, and reaches a review only as one block of the assembled prompt.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: string;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: string;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    return toSkillDto(row);
  }

  /**
   * Update a skill. Only a BODY change bumps the version and snapshots history —
   * the rule lives here (not in the repository) because it is a product rule.
   * The repository applies it to the row it has locked, so the decision can
   * never be made against a stale read.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch, (locked) => isBodyChange(locked, patch));
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to a
   * 404) so snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /** One snapshot. Undefined when the skill is foreign OR that version is absent. */
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

  /**
   * Roll back to `version`, discarding every newer snapshot. Destructive; the
   * client confirms first. Undefined when the skill is foreign or that version
   * does not exist.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /** The type catalogue behind the editor's dropdown. */
  async listTypes(workspaceId: string): Promise<SkillTypeItem[]> {
    const rows = await this.repo.listTypes(workspaceId);
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  /**
   * Parse an uploaded markdown file into a proposed skill. Persists NOTHING —
   * the client shows this as a preview and calls `create` only on confirm.
   */
  previewImport(filename: string, content: string): SkillImportPreview {
    return parseMarkdownSkill(filename, content);
  }

  /** Which of `ids` are skills of this workspace (used to reject foreign links). */
  async ownedIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    return this.repo.existingIds(workspaceId, ids);
  }
}
