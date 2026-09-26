import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillVersionDetail,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDetailDto, toSkillVersionDto } from './helpers.js';
import { computeFindingStats, computePullRate } from './stats.js';
import { parseSkillImport } from './import.js';

/**
 * A1 — skills service. Business logic for the Skills tab: CRUD + version
 * history (S4/S5), import preview (S6), and S10 usage stats. Repository owns
 * all Drizzle access; this class orchestrates it plus the pure helpers.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  note?: string;
  evidenceFiles?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string;
}

interface SkillRateAggregates {
  pullRate: number | null;
  acceptRate: number | null;
  /** null when no run ever used this skill (30d window) — "no data", never 0. */
  findingsCount: number | null;
  byCategory: { category: string; count: number }[];
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** GET /skills — workspace list with agent_count/pull_rate/accept_rate per skill. */
  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    if (rows.length === 0) return [];
    const since = thirtyDaysAgo();
    const agentCounts = await this.repo.agentCountsBySkillIds(
      workspaceId,
      rows.map((r) => r.id),
    );
    return Promise.all(
      rows.map(async (row) => {
        const agg = await this.rateAggregates(workspaceId, row.id, since);
        return toSkillDto(row, {
          agentCount: agentCounts.get(row.id) ?? 0,
          pullRate: agg.pullRate,
          acceptRate: agg.acceptRate,
        });
      }),
    );
  }

  /** S7 — undefined when the skill doesn't exist or isn't in this workspace. */
  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** S6 — `source: 'imported_file'` forces enabled:false and note 'Imported', regardless of input. */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const imported = source === 'imported_file';
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source,
      enabled: !imported,
      note: imported ? 'Imported' : input.note,
      evidenceFiles: input.evidenceFiles,
    });
    return toSkillDto(row);
  }

  /** S4 — a name/description/type/body change bumps the version; `enabled` alone does not. */
  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Undefined when the skill isn't in this workspace (route -> 404). */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map((row) => toSkillVersionDto(row, skill.version));
  }

  /** Undefined when the skill isn't in this workspace OR that version was never recorded. */
  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersionDetail | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDetailDto(row) : undefined;
  }

  /**
   * S5 — restore vN: a normal save (`repo.update`, same as S4) using vN's body
   * and note `Restored from v${N}`. Never rewrites history — always appends a
   * new version row.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const target = await this.repo.getVersion(id, version);
    if (!target) return undefined;
    const row = await this.repo.update(workspaceId, id, {
      body: target.body,
      note: `Restored from v${version}`,
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** GET /skills/:id/stats — S10. Undefined when the skill isn't in this workspace. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const since = thirtyDaysAgo();
    const [enabledAgents, agg] = await Promise.all([
      this.repo.linkedEnabledAgents(workspaceId, id),
      this.rateAggregates(workspaceId, id, since),
    ]);
    return {
      used_by: enabledAgents.length,
      agents: enabledAgents,
      pull_rate: agg.pullRate,
      accept_rate: agg.acceptRate,
      findings_30d: agg.findingsCount,
      by_category: agg.byCategory,
    };
  }

  /** POST /skills/tokens — live token count for the editor. */
  tokens(text: string): number {
    return this.container.tokenizer.count(text);
  }

  /** POST /skills/import/preview — S6, pure parse, writes nothing. Throws SkillImportError. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    return parseSkillImport(filename, contentBase64);
  }

  /** Shared S10 arithmetic behind both the list-card footers and /stats. */
  private async rateAggregates(
    workspaceId: string,
    skillId: string,
    since: Date,
  ): Promise<SkillRateAggregates> {
    const agentIds = await this.repo.linkedAgentIds(workspaceId, skillId);
    const [totalRuns, usedRunIds] = await Promise.all([
      this.repo.totalRuns(workspaceId, agentIds, since),
      this.repo.usedRunIds(workspaceId, agentIds, skillId, since),
    ]);
    const findingRows = await this.repo.findingsForRuns(workspaceId, usedRunIds);
    const { findingsCount, acceptRate, byCategory } = computeFindingStats(findingRows);
    return {
      pullRate: computePullRate(usedRunIds.length, totalRuns),
      acceptRate,
      findingsCount: usedRunIds.length === 0 ? null : findingsCount,
      byCategory,
    };
  }
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - THIRTY_DAYS_MS);
}
