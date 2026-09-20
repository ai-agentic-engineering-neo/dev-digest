import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillSource, SkillStats, SkillSummary, SkillType, SkillVersion } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsRepository, type SkillRow } from './repository.js';
import {
  aggregateFindingRows,
  decodeBase64Capped,
  importPreviewFromUpload,
  ratio,
  restoreMessage,
  toSkillDto,
  toSkillSummaryDto,
  toSkillVersionDto,
} from './helpers.js';
import { MAX_IMPORT_UPLOAD_BYTES, ONE_DAY_MS } from './constants.js';

/**
 * Skills service. CRUD + version history + stats + import-preview business
 * logic (specs/02-skills.md §7). Persistence goes through SkillsRepository;
 * pure transforms through helpers.ts; every literal through constants.ts.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Author's optional note on the new version (≤200 chars; NULL when blank). */
  version_message?: string;
  /**
   * Versions tab "Restore": load that version's body and write it FORWARD as a
   * new version labelled "Restored from vN" — history is never rewritten. Any
   * `body` in the same request is ignored in favour of the restored text.
   */
  restore_from_version?: number;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  private toDto(row: SkillRow): Skill {
    return toSkillDto(row, this.container.tokenizer.count(row.body));
  }

  async list(workspaceId: string): Promise<SkillSummary[]> {
    const rows = await this.repo.listWithUsage(workspaceId);
    return rows.map(({ skill, usedBy }) =>
      toSkillSummaryDto(skill, this.container.tokenizer.count(skill.body), usedBy),
    );
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? this.toDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
    });
    return this.toDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;

    let body = patch.body;
    let versionMessage: string | null =
      patch.version_message && patch.version_message.trim() !== '' ? patch.version_message.trim() : null;
    let forceBump = false;

    if (patch.restore_from_version !== undefined) {
      const versionRow = await this.repo.getVersion(id, patch.restore_from_version);
      if (!versionRow) throw new NotFoundError('Skill version not found');
      body = versionRow.body;
      versionMessage = restoreMessage(patch.restore_from_version);
      forceBump = true;
    }

    const row = await this.repo.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      { versionMessage, forceBump },
    );
    return row ? this.toDto(row) : undefined;
  }

  /** Hard delete (and its version history / agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** The delete-confirmation list — agents currently linking this skill. */
  async agentsUsing(workspaceId: string, id: string): Promise<{ id: string; name: string }[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.agentsUsingSkill(workspaceId, id);
  }

  /**
   * Run-level stats (§7.2), windowed on `agent_runs.ran_at`. Every ratio is
   * `null` (never a synthetic 0) when its denominator is zero.
   */
  async stats(workspaceId: string, id: string, days: number): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const since = new Date(Date.now() - days * ONE_DAY_MS);
    const agents = await this.repo.agentsUsingSkill(workspaceId, id);
    const linkedAgentIds = agents.map((a) => a.id);

    const [runsWithSkill, runsByLinkedAgents, findingRows] = await Promise.all([
      this.repo.countRunsWithSkill(workspaceId, id, since),
      this.repo.countRunsByAgents(workspaceId, linkedAgentIds, since),
      this.repo.findingRowsForSkillWindow(workspaceId, id, since),
    ]);

    const agg = aggregateFindingRows(findingRows);

    return {
      used_by: agents.length,
      agents,
      runs_with_skill: runsWithSkill,
      runs_by_linked_agents: runsByLinkedAgents,
      pull_frequency: ratio(runsWithSkill, runsByLinkedAgents),
      findings: agg.findings,
      accepted: agg.accepted,
      settled: agg.settled,
      accept_rate: ratio(agg.accepted, agg.settled) ?? 0,
      by_category: agg.by_category,
      window_days: days,
    };
  }

  /** Parse an upload into a preview. Writes nothing — persisted only on a later POST /skills. */
  async importPreview(workspaceId: string, filename: string, contentB64: string): Promise<SkillImportPreview> {
    const buffer = decodeBase64Capped(contentB64, MAX_IMPORT_UPLOAD_BYTES);
    const existingNames = new Set(await this.repo.listNames(workspaceId));
    return importPreviewFromUpload(filename, buffer, existingNames);
  }
}
