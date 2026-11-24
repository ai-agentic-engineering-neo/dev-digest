import type {
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillListItem,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { parseSkillImport } from './import.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';

export class SkillsService {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.skillsRepo;
  }

  async list(workspaceId: string): Promise<SkillListItem[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map((r) => ({ ...toSkillDto(r), agent_count: r.agentCount }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: SkillCreate): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source: input.source ?? 'manual',
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Put an earlier body back. History is append-only: restoring v2 on top of v5
   * writes v6 with v2's body. Restoring the body that is already current is a no-op.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    const target = await this.repo.getVersion(skill.id, version);
    if (!target) throw new NotFoundError('Version not found');
    if (target.body === skill.body) return toSkillDto(skill);
    const row = await this.repo.update(workspaceId, id, { body: target.body });
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return (await this.repo.listVersions(id)).map(toSkillVersionDto);
  }

  /** Parse an uploaded file into a preview. Persists NOTHING. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(contentBase64)) {
      throw new ValidationError('content_base64 is not valid base64');
    }
    return parseSkillImport(filename, new Uint8Array(Buffer.from(contentBase64, 'base64')));
  }
}
