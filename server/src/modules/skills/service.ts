import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillType, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { parseImportedSkill } from './import.js';

export { toSkillDto, toSkillVersionDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  note?: string | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string | null;
}

/**
 * Skills library service. A skill is markdown configuration only (no tools).
 * Config changes are versioned via `skill_versions` (repository).
 */
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

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'manual',
      body: input.body,
      enabled: input.enabled,
      note: input.note,
    });
    return toSkillDto(row);
  }

  previewImport(filename: string, bytes: Uint8Array): SkillImportPreview {
    return parseImportedSkill(filename, bytes);
  }

  async confirmImport(
    workspaceId: string,
    input: { name: string; description: string; type: SkillType; body: string },
  ): Promise<Skill> {
    if (!input.name.trim() || !input.description.trim() || !input.body.trim()) {
      throw new ValidationError('Imported skill requires name, description, and body');
    }
    const row = await this.repo.insert({
      workspaceId,
      name: input.name.trim(),
      description: input.description.trim(),
      type: input.type,
      source: 'imported',
      body: input.body.trim(),
      enabled: false,
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
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async listVersions(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

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

  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }
}
