import type { LLMProvider, Provider as ProviderId } from '@devdigest/shared';
import type {
  Agent,
  AgentSkillLink,
  AgentStats,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';
import {
  computeAgentMetrics,
  dailyTrendPoints,
  emptyPerfSourceRow,
  previousPeriod,
  resolvePerfRange,
  type PerfRange,
  type PerfSourceRow,
} from '../_shared/perf.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

/** Resolves an LLM provider by id. Injected so the service never reaches into
 *  the composition root; the container supplies its own `llm` method. */
export type LlmResolver = (id: ProviderId) => Promise<LLMProvider>;

/**
 * D18 (specs/12-eval-pipeline.md) — declared HERE, by the consumer, not
 * imported from `modules/eval/*` (`no-cross-module`). `container.evalRepo`
 * satisfies this structurally; wired at `modules/agents/routes.ts`. Optional
 * so the existing two-argument `new AgentsService(repo, llm)` constructions
 * in tests keep compiling.
 */
export interface EvalCleanup {
  deleteForOwner(workspaceId: string, ownerKind: 'skill' | 'agent', ownerId: string): Promise<void>;
}

/**
 * specs/16-agent-performance-dashboard.md — narrow port onto the `ci`
 * module's cross-cutting Agent Performance query. `no-cross-module` forbids
 * importing `CiRepository` directly (even as a type), so this mirrors the
 * `AgentLookup`/`EvalCleanup` local-port convention: `container.ciRepo`'s
 * real `performanceRows` satisfies this structurally, wired at
 * `modules/agents/routes.ts` (the composition point).
 */
export interface PerformanceRowSource {
  performanceRows(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfSourceRow[]>;
}

export class AgentsService {
  constructor(
    private repo: AgentsRepository,
    private llm: LlmResolver,
    private evalCleanup?: EvalCleanup,
    private perf?: PerformanceRowSource,
  ) {}

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toAgentDto);
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Delete an agent (and its versions/skill-links, via DB cascade). D18 —
   * its eval cases (and their runs) are deleted FIRST, application-side:
   * `eval_cases.owner_id` is polymorphic with no FK to `agents`, so nothing
   * cascades at the database level for that table.
   */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    await this.evalCleanup?.deleteForOwner(workspaceId, 'agent', id);
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /**
   * Linked skills for an agent as AgentSkillLink[] (ordered). `enabled` is the
   * PER-AGENT gate only — a link can be enabled here while the skill itself is
   * disabled workspace-wide, in which case it still doesn't reach the prompt.
   */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({
      agent_id: agentId,
      skill_id: l.skill.id,
      order: l.order,
      enabled: l.enabled,
    }));
  }

  /**
   * Set / reorder the agent's linked skills. If `skillIds` is provided, replaces
   * the whole set in that order. Returns the resulting ordered links.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.repo.setSkills(agentId, skillIds);
    return this.skillLinks(agentId);
  }

  /** Link a single skill (append or set order) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
    enabled?: boolean,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const existing = await this.repo.linkedSkills(agentId);
    const resolvedOrder = order ?? existing.length;
    await this.repo.linkSkill(agentId, skillId, resolvedOrder, enabled);
    return this.skillLinks(agentId);
  }

  /**
   * Toggle (or reposition) ONE link without unlinking it. Backs
   * `PUT /agents/:id/skills/:skillId` — the agent editor's checkbox.
   *
   * Unchecking must never delete the row: the `enabled` column exists precisely
   * so `order` survives, and re-checking restores the skill's place in the
   * assembled prompt instead of appending it to the end. A skill that was never
   * linked is inserted on first check.
   */
  async setSkillEnabled(
    workspaceId: string,
    agentId: string,
    skillId: string,
    patch: { enabled?: boolean; order?: number },
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.repo.setSkillEnabled(agentId, skillId, patch);
    return this.skillLinks(agentId);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }

  /**
   * specs/16-agent-performance-dashboard.md — GET /agents/:id/stats, the
   * per-agent Stats tab. Backed by the SAME `performanceRows` query (scoped
   * to this one agent) and the SAME `_shared/perf.ts` derivation rules the
   * global dashboard uses, so AC-1 ("matches the per-agent Stats view for
   * the same agent and period") holds by construction, not by convention.
   * `undefined` when the agent doesn't exist (routes.ts 404s).
   */
  async stats(workspaceId: string, agentId: string, range: PerfRange): Promise<AgentStats | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    if (!this.perf) {
      throw new Error('AgentsService.stats: no PerformanceRowSource wired');
    }

    const { from, to } = resolvePerfRange(range);
    const prevRange = previousPeriod(from, to);
    const [rows, prevRows] = await Promise.all([
      this.perf.performanceRows(workspaceId, from, to, agentId),
      this.perf.performanceRows(workspaceId, prevRange.from, prevRange.to, agentId),
    ]);
    const row = rows[0] ?? emptyPerfSourceRow(agentId);
    const metrics = computeAgentMetrics(row, prevRows[0]);

    return {
      agent_id: agentId,
      agent_name: agent.name,
      runs: metrics.runs,
      findings_total: row.totalFindings,
      accepted: row.accepted,
      dismissed: row.dismissed,
      pending: row.pending,
      accept_rate: metrics.accept_rate,
      dismiss_rate: metrics.dismiss_rate,
      avg_findings_per_run: metrics.avg_findings_per_run,
      total_cost_usd: row.totalCostUsd,
      avg_cost_usd: metrics.avg_cost_usd,
      avg_latency_ms: metrics.avg_latency_ms,
      // N4 (mirrors modules/ci/service.ts) — no per-severity attribution yet.
      findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      trend: dailyTrendPoints(row.runsByDay, from, to),
      counted_runs: row.countedRuns,
      costed_runs: row.costedRuns,
      cost_by_source: metrics.cost_by_source,
      decisions: metrics.decisions,
      low_sample: metrics.low_sample,
      runs_delta: metrics.runs_delta,
      accept_rate_delta: metrics.accept_rate_delta,
      cost_delta: metrics.cost_delta,
      range: { from: from.toISOString(), to: to.toISOString() },
    };
  }
}
