import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillBody,
  ConventionSkillDraft,
  ConventionSkillResult,
  Provider,
  RepoRef,
  Skill,
  UpdateConventionBody,
} from '@devdigest/shared';
import { ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  buildSkillDraft,
  clusterCandidates,
  dropDecided,
  isVisible,
  renderSamples,
  ruleKey,
  toCandidateDto,
  toSampledFile,
  verifyCandidate,
  type DropReason,
  type SampledFile,
  type VerifiedCandidate,
} from './helpers.js';
import { ExtractionSchema, SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import {
  CONFIG_SAMPLE_PATHS,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_REJECTED_IN_PROMPT,
  MAX_SAMPLE_CHARS,
  TOP_CODE_SAMPLES,
} from './constants.js';
import type { ConventionsDeps } from './types.js';

/**
 * Conventions extractor.
 *
 * Three stages, and only the middle one is a model:
 *   1. SAMPLE  - code picks the files (configs + repo-intel's top-ranked
 *                source files). The model never browses the repo.
 *   2. PROPOSE - one cheap structured call over that sample. Candidates are
 *                proposals with a citation, nothing more.
 *   3. VERIFY  - code re-reads the cited file and drops any candidate whose
 *                snippet is not really there (see helpers.verifyCandidate),
 *                then clusters same-rule candidates into one card.
 *
 * What survives is persisted as `pending` for the user to accept or reject;
 * accepted rules are assembled into the `repo-conventions` skill.
 */
export class ConventionsService {
  constructor(private deps: ConventionsDeps) {}

  /** Candidates for the board. Rejected rows stay in the DB (de-dup memory) but are hidden. */
  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.deps.store.listForRepo(workspaceId, repoId);
    return rows.filter(isVisible).map(toCandidateDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionBody,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.deps.store.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule.trim() } : {}),
      ...(patch.rationale !== undefined ? { rationale: patch.rationale?.trim() || null } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
    });
    return row ? toCandidateDto(row) : undefined;
  }

  /** Run a scan and replace this repo's pending candidates with the result. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const { store, log } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    // Stage 1: nothing readable means nothing to ask the model. 422 BEFORE any LLM call.
    const files = await this.sample(repoId, ref);
    if (files.length === 0) {
      throw new ValidationError(
        'Nothing to sample: the repository has not been cloned and indexed yet. Open it once so repo-intel can index it, then re-run the scan.',
      );
    }
    const byPath = new Map(files.map((f) => [f.path, f]));
    const sampledPaths = files.map((f) => f.path);
    const rendered = renderSamples(files, MAX_SAMPLE_CHARS);

    // Decision memory: rejected rules are replayed as "do not propose again".
    const existing = await store.listForRepo(workspaceId, repoId);
    const rejectedRules = existing
      .filter((r) => r.status === 'rejected')
      .slice(0, MAX_REJECTED_IN_PROMPT)
      .map((r) => r.rule);

    // Stage 2: the only model call. Model + provider come from Settings -> Feature Models.
    const choice = await this.deps.resolveModel(workspaceId);
    const llm = await this.providerFor(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionSchema,
      // Matches the fixture key `MockLLMOptions.structuredBySchema` documents
      // for this feature, so a test can target this call by name.
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(repo.fullName, rendered, sampledPaths, rejectedRules),
        },
      ],
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });

    // Stage 3: the evidence gate, then cluster, then drop what the user already decided.
    const proposed = result.data.candidates;
    const verified: VerifiedCandidate[] = [];
    const drops: DropReason[] = [];
    for (const raw of proposed) {
      const check = verifyCandidate(byPath, raw);
      if (check.ok) verified.push(check.candidate);
      else drops.push(check.reason);
    }
    const { clustered, merged } = clusterCandidates(verified);
    const decided = existing.filter((r) => r.status !== 'pending').map((r) => ruleKey(r.rule));
    const { kept, dropped: suppressed } = dropDecided(clustered, decided);

    await store.replacePending(workspaceId, repoId, kept);
    // Return the whole visible board, not just the new rows: the page renders
    // accepted candidates from earlier scans alongside these.
    const all = await store.listForRepo(workspaceId, repoId);

    const summary = {
      repo_id: repoId,
      model: result.model,
      sampled_files: sampledPaths.length,
      proposed: proposed.length,
      dropped_ungrounded: drops.length,
      dropped_duplicate: merged + suppressed,
      kept: kept.length,
      drop_reasons: countBy(drops),
      cost_usd: result.costUsd,
    };
    log.info(summary, 'conventions scan finished');

    return {
      candidates: all.filter(isVisible).map(toCandidateDto),
      sampled_files: sampledPaths,
      proposed: proposed.length,
      dropped_ungrounded: drops.length,
      dropped_duplicate: merged + suppressed,
      model: result.model,
      cost_usd: result.costUsd,
    };
  }

  /**
   * Skill draft from the ACCEPTED candidates. Persists NOTHING: the client
   * edits the draft and posts it to `createSkill`, the same preview-then-confirm
   * flow that skill import uses.
   */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const rows = await this.deps.store.listForRepo(workspaceId, repoId);
    const draft = buildSkillDraft(repo.fullName, rows);
    if (draft.convention_ids.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }
    return draft;
  }

  /**
   * Persist the user-edited draft as ONE skill, upserted by name, then link it
   * to the chosen agent additively (never the replace-all form: that would wipe
   * the agent's other skills). Every body write goes through the skills port, so
   * the prompt-injection scan covers it; a flagged skill is created blocked and
   * is not linked.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: ConventionSkillBody,
  ): Promise<ConventionSkillResult> {
    const { store, skills, agents, log } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const rows = await store.listForRepo(workspaceId, repoId);
    if (!rows.some((r) => r.status === 'accepted')) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }

    const name = input.name.trim();
    const existing = await skills.findByName(workspaceId, name);
    let skill: Skill | undefined;
    let created: boolean;
    if (existing) {
      skill = await skills.update(workspaceId, existing.id, {
        description: input.description,
        type: input.type,
        body: input.body,
      });
      if (!skill) throw new NotFoundError('Skill not found');
      created = false;
    } else {
      skill = await skills.create(workspaceId, {
        name,
        description: input.description,
        type: input.type,
        body: input.body,
        source: 'extracted',
        enabled: true,
      });
      created = true;
    }

    const agentId = input.agent_id ?? null;
    let linked = false;
    if (agentId && !skill.injection_detected) {
      linked = await agents.linkSkill(workspaceId, agentId, skill.id);
      if (!linked) throw new NotFoundError('Agent not found');
    }
    log.info(
      {
        repo_id: repoId,
        skill_id: skill.id,
        skill_version: skill.version,
        created,
        agent_id: agentId,
        linked,
        injection_detected: skill.injection_detected,
      },
      'conventions skill saved',
    );
    return { skill, created, agent_id: agentId, linked };
  }

  private async providerFor(provider: Provider) {
    try {
      return await this.deps.llm(provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new ValidationError(
          `Pick a model for Conventions in Settings → Feature Models (${err.message}).`,
        );
      }
      throw err;
    }
  }

  /**
   * Stage 1: pick and read the sample, entirely in code.
   *
   * Configs come first (they state conventions outright and are cheap), then
   * repo-intel's top-ranked source files, which already exclude tests, configs
   * and migrations. A file that cannot be read is skipped rather than fatal:
   * `CONFIG_SAMPLE_PATHS` is a wish-list, and most repos have only a few of
   * them. An EMPTY read counts as missing (the mock git client returns '' for
   * an unknown path). With repo-intel disabled, only the configs are sampled.
   */
  private async sample(repoId: string, ref: RepoRef): Promise<SampledFile[]> {
    const codePaths = await this.deps.repoIntel
      .getConventionSamples(repoId, TOP_CODE_SAMPLES)
      .catch(() => [] as string[]);
    const paths = [...CONFIG_SAMPLE_PATHS, ...codePaths];

    const files: SampledFile[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      let raw: string;
      try {
        raw = await this.deps.git.readFile(ref, path);
      } catch {
        continue; // not in this repo (config wish-list) or unreadable: skip
      }
      if (!raw.trim()) continue;
      files.push(toSampledFile(path, raw));
    }
    return files;
  }
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}
