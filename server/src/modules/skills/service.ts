import type {
  AgentSuggestion,
  CreateSkillInput,
  ImportedSkillDraft,
  Skill,
  SkillSafety,
  SkillStats,
  SkillUsage,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { scanSkillBody } from '@devdigest/reviewer-core';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ConflictError } from './errors.js';
import type { SkillsRepository } from './repository.js';
import { IMPORT_BODY_MAX, STATS_WINDOW_DAYS } from './constants.js';
import {
  draftFromMarkdown,
  nameFromUrl,
  normalizeImportedBody,
  rankAgentSuggestions,
  toAgentActivity,
  windowStart,
} from './helpers.js';
import type { AgentSuggestionSignals, RemoteTextFetcher } from './ports.js';

/**
 * Skills use cases (SPEC §4.3). Workspace-scoped throughout: a skill from
 * another workspace is a 404. Persistence and atomicity live in the repository.
 */

/** Storage the skills use cases need (implemented by SkillsRepository). */
export type SkillsStore = Pick<
  SkillsRepository,
  | 'list'
  | 'getById'
  | 'insert'
  | 'update'
  | 'deleteById'
  | 'agentsUsing'
  | 'listVersions'
  | 'getVersion'
  | 'versionCount'
  | 'restore'
  | 'agentActivity'
>;

const SKILL_NOT_FOUND = 'Skill not found';

export class SkillsService {
  private readonly repo: SkillsStore;
  private readonly signals: AgentSuggestionSignals;
  private readonly fetcher: RemoteTextFetcher;
  private readonly now: () => Date;

  /** Explicit deps (onion-architecture §10). `now` is injectable for the stats window. */
  constructor(deps: {
    repo: SkillsStore;
    signals: AgentSuggestionSignals;
    fetcher: RemoteTextFetcher;
    now?: () => Date;
  }) {
    this.repo = deps.repo;
    this.signals = deps.signals;
    this.fetcher = deps.fetcher;
    this.now = deps.now ?? (() => new Date());
  }

  list(workspaceId: string): Promise<Skill[]> {
    return this.repo.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError(SKILL_NOT_FOUND);
    return skill;
  }

  /** Create a skill; an imported one (file / URL) is always stored disabled — vet it first. */
  create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return this.repo.insert(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      enabled: input.source ? false : input.enabled,
      ...(input.source ? { source: input.source } : {}),
    });
  }

  /** Injection scan of a body before it is saved (writes nothing; the write re-scans). */
  scan(body: string): SkillSafety {
    return scanSkillBody(body, this.now().toISOString());
  }

  /**
   * "Import from URL": fetch the file (SSRF rules live in the fetcher), turn it
   * into a draft and scan it. Writes nothing — the user reviews the draft and
   * saves it through `create` with `source: imported_url`.
   */
  async importFromUrl(url: string): Promise<ImportedSkillDraft> {
    const fetched = await this.fetcher.fetchText(url);
    const body = normalizeImportedBody(fetched.text);
    if (body.trim().length === 0) throw new ValidationError('The file at this URL is empty');
    if (body.length > IMPORT_BODY_MAX) {
      throw new ValidationError(`The file is longer than ${IMPORT_BODY_MAX.toLocaleString('en')} characters`);
    }
    return {
      ...draftFromMarkdown(body, nameFromUrl(fetched.url)),
      body,
      source_url: fetched.url,
      safety: this.scan(body),
    };
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill> {
    const skill = await this.repo.update(workspaceId, id, patch);
    if (!skill) throw new NotFoundError(SKILL_NOT_FOUND);
    return skill;
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.deleteById(workspaceId, id);
    if (!ok) throw new NotFoundError(SKILL_NOT_FOUND);
  }

  /** Agents using the skill (delete dialog). */
  async agentsUsing(workspaceId: string, id: string): Promise<SkillUsage[]> {
    await this.get(workspaceId, id);
    const agents = await this.repo.agentsUsing(workspaceId, id);
    return agents.map((a) => ({ agent_id: a.agent_id, agent_name: a.agent_name }));
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.get(workspaceId, id);
    return this.repo.listVersions(workspaceId, id);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion> {
    const row = await this.repo.getVersion(workspaceId, id, version);
    if (!row) throw new NotFoundError('Skill version not found');
    return row;
  }

  /** Restore vN as a new version; restoring the current version is a 409. */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const result = await this.repo.restore(workspaceId, id, version);
    switch (result.kind) {
      case 'ok':
        return result.skill;
      case 'skill_not_found':
        throw new NotFoundError(SKILL_NOT_FOUND);
      case 'version_not_found':
        throw new NotFoundError('Skill version not found');
      case 'is_current':
        throw new ConflictError(`v${version} is already the current version`);
    }
  }

  /**
   * Stats tab (SPEC §3.4): usage + version counts from the skill, and each
   * attached agent's OWN last-30-day activity — nothing attributed to the skill.
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    const skill = await this.get(workspaceId, id);
    const agents = await this.repo.agentsUsing(workspaceId, id);
    const [versionCount, activity] = await Promise.all([
      this.repo.versionCount(workspaceId, id),
      this.repo.agentActivity(
        workspaceId,
        agents.map((a) => a.agent_id),
        windowStart(this.now(), STATS_WINDOW_DAYS),
      ),
    ]);
    return {
      agent_count: agents.length,
      enabled_agent_count: agents.filter((a) => a.enabled).length,
      version_count: versionCount,
      created_at: skill.created_at,
      updated_at: skill.updated_at,
      agents: agents.map((a) => toAgentActivity(a, activity.get(a.agent_id))),
    };
  }

  /**
   * Agents that would likely want this skill (plan §D): enabled, not linked yet,
   * scored by convention category, skill type and shared words — no LLM, no
   * writes. Agents scoring 0 are left out; best first, at most 10.
   */
  async agentSuggestions(workspaceId: string, id: string): Promise<AgentSuggestion[]> {
    const skill = await this.get(workspaceId, id);
    const [categories, agents] = await Promise.all([
      this.signals.skillCategories(workspaceId, id),
      this.signals.candidateAgents(workspaceId, id),
    ]);
    return rankAgentSuggestions({ ...skill, categories }, agents);
  }
}
