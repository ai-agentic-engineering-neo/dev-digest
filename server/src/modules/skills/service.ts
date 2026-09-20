import { SKILL_STATS_WINDOW_DAYS } from '@devdigest/shared';
import type { Skill, SkillStats, SkillStatsSummary, SkillImportPreview, SkillImportRequest, SkillInput, SkillUpdate } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES } from './constants.js';
import { buildImportPreview, computeSkillStats, toSkillDto, toStatsSummary } from './helpers.js';

/**
 * Skills use cases. The database is the source of truth: nothing is cached and an
 * import never writes — `previewImport` only parses; the caller confirms by
 * creating the skill through `create` (source `imported_file`).
 */
export class SkillsService {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.skillsRepo;
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Stats of every skill in the workspace (list-card footers). */
  async statsSummary(workspaceId: string, now: Date = new Date()): Promise<SkillStatsSummary[]> {
    const all = await this.computeStats(workspaceId, undefined, now);
    return all.map(toStatsSummary);
  }

  /** Stats of one skill; undefined when it is not in the workspace. */
  async stats(workspaceId: string, id: string, now: Date = new Date()): Promise<SkillStats | undefined> {
    return (await this.computeStats(workspaceId, id, now))[0];
  }

  private async computeStats(workspaceId: string, id: string | undefined, now: Date): Promise<SkillStats[]> {
    const rows = id ? [await this.repo.getById(workspaceId, id)] : await this.repo.list(workspaceId);
    const skills = rows.filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ id: r.id, name: r.name }));
    if (skills.length === 0) return [];
    const since = new Date(now.getTime() - SKILL_STATS_WINDOW_DAYS * 86_400_000);
    const usage = await this.repo.usageData(workspaceId, since);
    return computeSkillStats({ skills, ...usage, windowDays: SKILL_STATS_WINDOW_DAYS });
  }

  async create(workspaceId: string, input: SkillInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: input.body,
      // A skill from outside starts switched on only if the user chose so; the
      // preview flow confirms explicitly, so default to on like a manual one.
      enabled: input.enabled ?? true,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill | undefined> {
    if (patch.name !== undefined) await this.assertNameFree(workspaceId, patch.name, id);
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.delete(workspaceId, id);
  }

  /** Parse an uploaded .md/.zip into a preview. Stores nothing. */
  previewImport(req: SkillImportRequest): SkillImportPreview {
    // Reject oversize BEFORE decoding: base64 is ~4/3 of the raw size.
    if (req.content_base64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8) {
      throw new AppError('file_too_large', 'File is too large (max 512 KB)', 413);
    }
    const bytes = new Uint8Array(Buffer.from(req.content_base64, 'base64'));
    return buildImportPreview(req.filename, bytes);
  }

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string) {
    const clash = await this.repo.findByName(workspaceId, name);
    if (clash && clash.id !== exceptId) {
      throw new AppError('skill_name_taken', `A skill named "${name}" already exists`, 409);
    }
  }
}

