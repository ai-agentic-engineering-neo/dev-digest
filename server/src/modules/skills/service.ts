import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillInput,
  SkillPatch,
  SkillPreview,
  SkillVersion,
} from '@devdigest/shared';
import { formatSkillBlock } from '@devdigest/reviewer-core';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { parseSkillImport } from './import.js';

/**
 * Skills service — reusable, versioned review instructions attached to agents.
 * A skill is text only: create / edit / import never execute anything.
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map((r) => toSkillDto(r.skill, r.agentCount));
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row, await this.repo.countAgents(id));
  }

  /** `evidenceFiles` is internal (set by the Conventions extractor), not part of the public `SkillInput`. */
  async create(
    workspaceId: string,
    input: SkillInput & { evidenceFiles?: string[] },
  ): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
      evidenceFiles: input.evidenceFiles ?? null,
    });
    return toSkillDto(row, 0);
  }

  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row, await this.repo.countAgents(id));
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.deleteById(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.requireSkill(workspaceId, id);
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /** Restore = save vN's body as a NEW version; history is never rewritten. */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.requireSkill(workspaceId, id);
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new NotFoundError('Skill version not found');
    if (snapshot.body === skill.body) return toSkillDto(skill, await this.repo.countAgents(id));
    return this.update(workspaceId, id, { body: snapshot.body });
  }

  /** The exact block an agent receives for this skill + its token count. */
  async preview(workspaceId: string, id: string): Promise<SkillPreview> {
    const skill = await this.requireSkill(workspaceId, id);
    const block = formatSkillBlock(skill);
    return { block, tokens: this.container.tokenizer.count(block) };
  }

  /** Parse an upload into a preview. Persists nothing — the user confirms first. */
  importPreview(filename: string, contentBase64: string): SkillImportPreview {
    const bytes = Buffer.from(contentBase64, 'base64');
    const result = parseSkillImport(filename, new Uint8Array(bytes));
    if (!result.ok) throw new ValidationError(result.error);
    return result.preview;
  }

  private async requireSkill(workspaceId: string, id: string) {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return row;
  }
}
