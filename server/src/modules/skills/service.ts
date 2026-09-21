import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { importSkillFromFile, type ImportSkillFileInput, type ImportSkillResult } from './import.js';

/**
 * A1 — skills service. Business logic for the Skills library + editor.
 *
 * A Skill = name + description + type + source + body (markdown) + enabled.
 * Body changes are versioned via `skill_versions` (repository). `agents_count`
 * is derived (agent_skills), never stored.
 */

export type { ImportSkillResult } from './import.js';

const DEFAULT_SOURCE: SkillSource = 'manual';

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
  /** Recorded on the new version snapshot when `body` actually changes. */
  change_note?: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.agentCounts(workspaceId),
    ]);
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
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
      source: input.source ?? DEFAULT_SOURCE,
      body: input.body,
      enabled: input.enabled,
      evidenceFiles: input.evidence_files,
    });
    return toSkillDto(row, 0);
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
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      ...(patch.change_note !== undefined ? { changeNote: patch.change_note } : {}),
    });
    if (!row) return undefined;
    const counts = await this.repo.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Version history for a skill, newest first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (route maps that to 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * A single body snapshot for a skill. Returns undefined when the skill
   * isn't in this workspace OR that version was never recorded (route → 404).
   */
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
   * Restore an old version's body as a new version on top. Returns undefined
   * when the skill isn't in this workspace or that version was never recorded.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, id, version);
    if (!row) return undefined;
    const counts = await this.repo.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Parse an uploaded `.md`/`.markdown`/`.txt`/`.zip` file into a skill preview
   * (name + body + warnings) — pure parsing, no DB write. See `./import.ts`.
   */
  importFromFile(input: ImportSkillFileInput): ImportSkillResult {
    return importSkillFromFile(input);
  }
}
