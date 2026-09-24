/**
 * Conventions use cases (server/specs/04-conventions.md): start a scan, run it in
 * the background (sample → propose → verify → persist), review the rules, and
 * merge the accepted ones into a skill linked to agents.
 */
import type {
  Convention,
  ConventionScan,
  ConventionsState,
  CreateConventionSkillInput,
  CreateConventionSkillResult,
  UpdateConventionInput,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../../platform/errors.js';
import { sectionMeta, type PromptLogPort } from '../../../platform/prompt-log.js';
import { SAMPLE_TOP_N, SCAN_STALE_MS } from '../domain/constants.js';
import { ruleKey } from '../domain/evidence.js';
import {
  EXTRACTION_SYSTEM_PROMPT,
  extractionTaskText,
  extractionUserMessage,
  wrappedRepositorySample,
} from '../domain/extraction.js';
import { citedPaths, gateCandidates } from '../domain/gate.js';
import { pickConfigFiles, pickFallbackSources, renderSample, type SampledFile } from '../domain/sampling.js';
import type {
  AgentLinker,
  AgentRef,
  CloneFiles,
  Clock,
  ConventionModel,
  ConventionsStore,
  ExtractJobPayload,
  RepoLookup,
  RepoRef,
  SampleRanker,
  ScanQueue,
  SkillCreator,
} from './ports.js';

export interface ConventionsServiceDeps {
  store: ConventionsStore;
  repos: RepoLookup;
  files: CloneFiles;
  ranker: SampleRanker;
  model: ConventionModel;
  queue: ScanQueue;
  skills: SkillCreator;
  agents: AgentLinker;
  clock: Clock;
  /** Structured, content-free prompt-assembly logging (platform/prompt-log.ts); undefined = no-op. */
  promptLog?: PromptLogPort;
}

/** Minimal logger port (the job handler passes its own). */
export interface ScanLogger {
  warn(obj: object, msg: string): void;
}

const REPO_NOT_FOUND = 'Repo not found';
const ERROR_MAX_CHARS = 500;

export class ConventionsService {
  constructor(private readonly deps: ConventionsServiceDeps) {}

  async state(workspaceId: string, repoId: string): Promise<ConventionsState> {
    await this.repo(workspaceId, repoId);
    const [scan, conventions] = await Promise.all([
      this.deps.store.latestScan(repoId),
      this.deps.store.list(repoId),
    ]);
    return { scan: scan ?? null, conventions };
  }

  /** Start a background scan (202). One running scan per repo. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.repo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ValidationError('The repo is not cloned yet — wait for the clone to finish', undefined, 'not_cloned');
    }
    await this.deps.store.failStaleScans(repoId, new Date(this.deps.clock().getTime() - SCAN_STALE_MS));
    const scan = await this.deps.store.startScan(workspaceId, repoId);
    try {
      await this.deps.queue.enqueue({ scanId: scan.id, workspaceId, repoId });
    } catch (err) {
      await this.deps.store.failScan(scan.id, errorText(err));
      throw err;
    }
    return scan;
  }

  /**
   * The job body. Never throws: any failure ends the scan `failed` with a short
   * error, so the JobRunner does not retry (and spend on the model twice).
   */
  async runScan(payload: ExtractJobPayload, signal: AbortSignal, log?: ScanLogger): Promise<void> {
    const { scanId, workspaceId, repoId } = payload;
    let sampledFiles: string[] = [];
    try {
      const repo = await this.deps.repos.get(workspaceId, repoId);
      if (!repo?.clonePath) throw new Error('The repo is not cloned');
      const root = repo.clonePath;

      const sample = await this.sample(repo, root);
      sampledFiles = sample.included;
      if (sampledFiles.length === 0) throw new Error('No source or config files to sample in the clone');

      const proposal = await this.deps.model.propose(
        workspaceId,
        [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: extractionUserMessage(repo.fullName, sample.text) },
        ],
        signal,
        (resolved) =>
          this.deps.promptLog?.assembled({
            feature: 'conventions',
            correlationId: scanId,
            provider: resolved.provider,
            model: resolved.model,
            sections: [
              sectionMeta('system', 'engine', 'trusted', EXTRACTION_SYSTEM_PROMPT),
              sectionMeta('task', 'engine', 'trusted', extractionTaskText(repo.fullName)),
              sectionMeta('repository_sample', 'repo', 'untrusted', wrappedRepositorySample(sample.text), {
                items: sampledFiles.length,
              }),
            ],
          }),
      );
      const candidates = proposal.data.candidates;

      const texts = new Map<string, string[] | null>();
      await Promise.all(
        citedPaths(candidates).map(async (p) => {
          const text = await this.deps.files.read(root, p);
          texts.set(p, text === null ? null : text.replace(/\r\n?/g, '\n').split('\n'));
        }),
      );
      const existing = await this.deps.store.list(repoId);
      const known = new Set(existing.filter((c) => c.status !== 'pending' || c.edited).map((c) => ruleKey(c.rule)));
      const { kept, dropped } = gateCandidates(candidates, (p) => texts.get(p) ?? null, known);

      signal.throwIfAborted();
      await this.deps.store.completeScan({ id: scanId, workspaceId, repoId }, kept, {
        sampledFiles,
        proposed: candidates.length,
        kept: kept.length,
        dropped,
        model: proposal.model,
        tokensIn: proposal.tokensIn,
        tokensOut: proposal.tokensOut,
        costUsd: proposal.costUsd,
      });
    } catch (err) {
      log?.warn({ err, scanId, repoId }, 'conventions scan failed');
      await this.deps.store.failScan(scanId, errorText(err), { sampledFiles }).catch(() => {});
    }
  }

  async update(workspaceId: string, id: string, input: UpdateConventionInput): Promise<Convention> {
    const current = await this.deps.store.find(workspaceId, id);
    if (!current) throw new NotFoundError('Convention not found');
    const textChanged =
      (input.rule !== undefined && input.rule !== current.rule) ||
      (input.category !== undefined && input.category !== current.category);
    const saved = await this.deps.store.update(workspaceId, id, {
      ...input,
      ...(textChanged ? { edited: true } : {}),
    });
    if (!saved) throw new NotFoundError('Convention not found');
    return saved;
  }

  /** Merge accepted rules into a new `extracted` skill and link it to agents. */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillInput,
  ): Promise<CreateConventionSkillResult> {
    const repo = await this.repo(workspaceId, repoId);
    const accepted = new Set(
      (await this.deps.store.list(repoId)).filter((c) => c.status === 'accepted').map((c) => c.id),
    );
    const ids = [...new Set(input.convention_ids)];
    const notAccepted = ids.filter((id) => !accepted.has(id));
    if (notAccepted.length > 0) {
      throw new ValidationError('Only accepted conventions of this repo can be merged into a skill', {
        ids: notAccepted,
      });
    }

    const agentIds = [...new Set(input.agent_ids ?? [])];
    const agents: AgentRef[] = [];
    for (const agentId of agentIds) {
      const agent = await this.deps.agents.get(workspaceId, agentId);
      if (!agent) throw new ValidationError('Unknown agent', { id: agentId }, 'unknown_agent');
      agents.push(agent);
    }

    const skill = await this.deps.skills.createExtracted(workspaceId, repo.fullName, {
      name: input.name,
      description: input.description,
      type: input.type ?? 'convention',
      body: input.body,
      enabled: input.enabled ?? true,
    });
    for (const agent of agents) await this.deps.agents.linkSkill(workspaceId, agent.id, skill.id);
    await this.deps.store.setSkill(repoId, ids, skill.id);
    return {
      skill: { ...skill, used_by: agents.length },
      linked_agents: agents.map((a) => ({ id: a.id, name: a.name, enabled: a.enabled })),
    };
  }

  private async repo(workspaceId: string, repoId: string): Promise<RepoRef> {
    const repo = await this.deps.repos.get(workspaceId, repoId);
    if (!repo) throw new NotFoundError(REPO_NOT_FOUND);
    return repo;
  }

  /** Configs + top-ranked sources (fallback walk when the repo is not indexed). */
  private async sample(repo: RepoRef, root: string): Promise<{ text: string; included: string[] }> {
    const paths = await this.deps.files.list(root);
    const present = new Set(paths);
    const configs = pickConfigFiles(paths);
    const ranked = await this.deps.ranker.getConventionSamples(repo.id, SAMPLE_TOP_N).catch(() => []);
    const rankedPresent = ranked.filter((p) => present.has(p) && !configs.includes(p));
    const sources = rankedPresent.length > 0 ? rankedPresent : pickFallbackSources(paths);

    const files: SampledFile[] = [];
    for (const [path, kind] of [
      ...configs.map((p) => [p, 'config'] as const),
      ...sources.map((p) => [p, 'source'] as const),
    ]) {
      const content = await this.deps.files.read(root, path);
      if (content?.trim()) files.push({ path, kind, content });
    }
    return renderSample(files);
  }
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, ERROR_MAX_CHARS);
}
