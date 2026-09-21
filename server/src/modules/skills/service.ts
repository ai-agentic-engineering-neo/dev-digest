import type {
  Skill,
  SkillListItem,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ConflictError, NotFoundError, SkillBlockedError, ValidationError } from '../../platform/errors.js';
import type { SkillsDeps, SkillsStore, SkillUrlFetcher } from './types.js';
import { detectInjection, type InjectionScan } from './injection.js';
import {
  EMPTY_USAGE,
  deriveImportName,
  normalizeImportUrl,
  parseSkillMarkdown,
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

export interface ImportSkillUrlInput {
  url: string;
  name?: string;
  type?: SkillType;
}

/** What the injection scan persists: matches are kept only when the skill is blocked. */
function toScanColumns(scan: InjectionScan) {
  return {
    injectionDetected: scan.detected,
    injectionMatches: scan.detected ? scan.matches : [],
  };
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
  private urlFetcher: SkillUrlFetcher;

  constructor(deps: SkillsDeps) {
    this.repo = deps.repo;
    this.urlFetcher = deps.urlFetcher;
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
   * Create a skill (also snapshots v1). Manual creation and file import
   * (`source: 'extracted'`) start enabled — unless the injection scan flags the
   * body, in which case the skill is stored but force-disabled (auto-blocked).
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const scan = detectInjection(input.body);
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      body: input.body,
      source: input.source ?? 'manual',
      enabled: scan.detected ? false : (input.enabled ?? true),
      ...toScanColumns(scan),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
    return toSkillDto(row);
  }

  /**
   * Import a markdown skill from an https URL (fetched server-side through the
   * `UrlFetcher` port). Name: request -> front-matter -> first heading -> URL
   * segment; description from front-matter. Source is always `imported_url`.
   */
  async importFromUrl(workspaceId: string, input: ImportSkillUrlInput): Promise<Skill> {
    const checked = normalizeImportUrl(input.url);
    if (!checked.ok) throw new ValidationError(checked.message);
    const fetched = await this.urlFetcher.fetchText(checked.url);
    const parsed = parseSkillMarkdown(fetched.text);
    if (!parsed.body.trim()) throw new ValidationError('The fetched file is empty');
    const scan = detectInjection(parsed.body);
    const row = await this.repo.insert({
      workspaceId,
      name: deriveImportName(input.name, parsed, fetched.url),
      description: parsed.description,
      type: input.type ?? 'custom',
      body: parsed.body,
      source: 'imported_url',
      enabled: !scan.detected,
      ...toScanColumns(scan),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    // A body edit re-scans: a flagged body force-disables, a clean one lifts the
    // flag but never auto-enables. Without a body edit the stored flag stands.
    const scan = patch.body !== undefined ? detectInjection(patch.body) : undefined;
    if (patch.enabled === true) {
      const flagged =
        scan?.detected ?? (await this.repo.getById(workspaceId, id))?.injectionDetected ?? false;
      if (flagged) {
        throw new SkillBlockedError('Skill is blocked: prompt injection detected, it cannot be enabled');
      }
    }
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(scan ? toScanColumns(scan) : {}),
      // Newly flagged by this edit: block it (overrides nothing the caller asked
      // for — `enabled: true` already threw above).
      ...(scan?.detected ? { enabled: false } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Append-only restore: creates version N+1 whose body is `version`'s body and
   * records `restored_from`. Never rewinds the counter. 404 when the skill or the
   * version is unknown, 409 when `version` is already the current one. The
   * restored body is re-scanned (a flagged body is force-disabled).
   */
  async restore(workspaceId: string, skillId: string, version: number): Promise<Skill> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const snapshot = await this.repo.getVersion(skillId, version);
    if (!snapshot) throw new NotFoundError('Skill version not found');
    if (snapshot.version === skill.version) {
      throw new ConflictError(`v${version} is already the current version`);
    }
    const scan = detectInjection(snapshot.body);
    const outcome = await this.repo.restoreVersion(workspaceId, skillId, version, {
      body: snapshot.body,
      ...toScanColumns(scan),
      ...(scan.detected ? { enabled: false } : {}),
    });
    if (outcome.kind === 'not_found') throw new NotFoundError('Skill not found');
    // Lost a race with another edit that made `version` current in the meantime.
    if (outcome.kind === 'is_current') {
      throw new ConflictError(`v${version} is already the current version`);
    }
    return toSkillDto(outcome.skill);
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
