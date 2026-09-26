import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CONFIG_SAMPLE_PATHS,
  EXTRACT_MAX_RETRIES,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_SAMPLE_CHARS,
  TOP_CODE_SAMPLES,
} from './constants.js';
import {
  buildSkillDraft,
  dedupeCandidates,
  renderSamples,
  ruleKey,
  toCandidateDto,
  toSampledFile,
  verifyCandidate,
  type SampledFile,
  type VerifiedCandidate,
} from './helpers.js';
import {
  buildUserPrompt,
  EXTRACTION_SCHEMA_NAME,
  ExtractionSchema,
  SYSTEM_PROMPT,
} from './prompt.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';

/**
 * L02 — the Conventions Extractor (ring ②).
 *
 * Three stages, and only the middle one is a model:
 *
 *   SAMPLE   config files + `repoIntel.getConventionSamples()`, rendered with a
 *            1-based line gutter. Pure code — the model never browses.
 *   PROPOSE  one structured call on the model from FEATURE_MODELS.conventions.
 *   VERIFY   re-read the cited file: the path must have been sampled, the
 *            snippet must be substantial and must really occur there. A wrong
 *            line number is corrected; an invented snippet is dropped.
 *
 * See ../../../specs/L02-conventions.md.
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  /** Scan the repo: sample in code, propose once, verify in code, persist. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);

    // ---- stage 1: sample (no model) --------------------------------------
    const files = await this.sample(repo);
    if (files.size === 0) {
      throw new ValidationError(
        'Nothing to sample in this repository — clone and index it first.',
        { repo_id: repoId },
      );
    }
    const sampledPaths = [...files.keys()];
    const rendered = renderSamples([...files.values()], MAX_SAMPLE_CHARS);

    // ---- stage 2: propose (the only model call) --------------------------
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      maxRetries: EXTRACT_MAX_RETRIES,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(repo.fullName, rendered, sampledPaths) },
      ],
    });

    // ---- stage 3: verify (no model) --------------------------------------
    const proposed = res.data.candidates;
    const verified: VerifiedCandidate[] = [];
    let droppedUngrounded = 0;
    for (const c of proposed) {
      const check = verifyCandidate(files, c);
      if (check.ok) verified.push(check.candidate);
      else droppedUngrounded += 1;
    }
    verified.sort((a, b) => b.confidence - a.confidence);

    // A rule the user has already decided on must not come back as a new
    // candidate, so previous decisions seed the dedupe set.
    const existing = await this.repo.listForRepo(workspaceId, repoId);
    const decided = existing.filter((r) => r.status !== 'pending');
    const { kept, dropped: droppedDuplicate } = dedupeCandidates(
      verified,
      decided.map((r) => ruleKey(r.rule)),
    );

    const inserts: InsertConvention[] = kept.map((c) => ({
      workspaceId,
      repoId,
      rule: c.rule,
      rationale: c.rationale,
      category: c.category,
      evidencePath: c.evidencePath,
      evidenceLine: c.evidenceLine,
      evidenceSnippet: c.evidenceSnippet,
      confidence: c.confidence,
    }));
    await this.repo.replacePending(workspaceId, repoId, inserts);

    return {
      candidates: await this.list(workspaceId, repoId),
      proposed: proposed.length,
      dropped_ungrounded: droppedUngrounded,
      dropped_duplicate: droppedDuplicate,
      sampled_files: files.size,
      model: res.model,
      cost_usd: res.costUsd,
    };
  }

  async setStatus(
    workspaceId: string,
    id: string,
    patch: { rule?: string; rationale?: string | null; status?: ConventionStatus },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.remove(workspaceId, id);
  }

  /**
   * Assemble the selected candidates into a skill draft. Persists NOTHING: the
   * user edits the draft and `POST /skills` stores it, the same
   * preview-then-confirm flow as skill import.
   */
  async skillDraft(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = (await this.repo.getManyById(workspaceId, ids)).filter((r) => r.repoId === repoId);
    if (rows.length === 0) {
      throw new ValidationError('Select at least one convention to build a skill from.', {
        requested: ids.length,
      });
    }
    // An id the user cannot see must not silently vanish from the draft.
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Some conventions do not belong to this repository.', { missing });
    }
    return buildSkillDraft(repo.fullName, rows);
  }

  // ---- internals ---------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Unknown repository.', { repo_id: repoId });
    if (!repo.clonePath) {
      throw new ValidationError('This repository has not been cloned yet.', { repo_id: repoId });
    }
    return repo;
  }

  /**
   * Stage 1 — what the model is allowed to read, chosen entirely in code.
   *
   * Config files first (they state conventions outright), then the repo's most
   * central source files as ranked by repo-intel. A file that cannot be read is
   * skipped silently: most repos carry only a handful of the config paths.
   */
  private async sample(repo: RepoRow): Promise<Map<string, SampledFile>> {
    const ref = { owner: repo.owner, name: repo.name };
    const ranked = await this.container.repoIntel.getConventionSamples(repo.id, TOP_CODE_SAMPLES);
    const paths = [...CONFIG_SAMPLE_PATHS, ...ranked];

    const files = new Map<string, SampledFile>();
    for (const path of paths) {
      if (files.has(path)) continue;
      let raw: string;
      try {
        raw = await this.container.git.readFile(ref, path);
      } catch {
        continue;
      }
      if (!raw?.trim()) continue;
      files.set(path, toSampledFile(path, raw));
    }
    return files;
  }
}
