import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ConventionSkillResult,
  ConventionScanResult,
  ConventionsPage,
  CreateSkillFromConventionsInput,
  UpdateConventionInput,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CONFIG_SAMPLE_PATHS,
  CONVENTION_SKILL_TYPE,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  EXTRACTED_SOURCE,
  EXTRACTION_SCHEMA_NAME,
  MAX_SAMPLE_CHARS,
  TOP_CODE_SAMPLES,
} from './constants.js';
import {
  buildSkillBody,
  defaultSkillDescription,
  defaultSkillName,
  evidenceFiles,
  latestScan,
  mergeAndDedupe,
  renderSamples,
  ruleKey,
  toCandidateDto,
  toSampledFile,
  verifyCandidate,
  type ConventionDetails,
  type ConventionPatch,
  type ConventionRecord,
  type RepoRefRecord,
  type SampledFile,
  type SkillRule,
  type VerifiedRule,
} from './helpers.js';
import {
  EXTRACTION_INJECTION_GUARD,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
  buildExtractionUserPrompt,
} from './prompt.js';
import type {
  CloneReader,
  ConventionSampler,
  ConventionsStore,
  ExtractionModelResolver,
  SkillWriter,
  TokenCounter,
} from './ports.js';

/**
 * Conventions Extractor use cases. Three scan stages, only the middle one a model:
 *   SAMPLE  config files + repo-intel's top-ranked files, line-numbered (code);
 *   PROPOSE one structured call on the workspace's `conventions` model;
 *   VERIFY  every cited snippet is re-found in the file it names (code).
 * Accepted rules then become a skill (`type: convention`, `source: extracted`).
 */

export interface ConventionsDeps {
  store: ConventionsStore;
  sampler: ConventionSampler;
  clone: CloneReader;
  model: ExtractionModelResolver;
  skills: SkillWriter;
  tokens: TokenCounter;
  now?: () => Date;
}

const REPO_NOT_FOUND = 'Repo not found';
const CONVENTION_NOT_FOUND = 'Convention not found';

export class ConventionsService {
  private readonly d: ConventionsDeps;
  private readonly now: () => Date;

  constructor(deps: ConventionsDeps) {
    this.d = deps;
    this.now = deps.now ?? (() => new Date());
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsPage> {
    await this.repo(workspaceId, repoId);
    return this.page(workspaceId, repoId);
  }

  async scan(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.repo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Repo is not cloned yet — clone it first.');

    // SAMPLE — the model never chooses what it reads.
    const codePaths = await this.d.sampler.getConventionSamples(repoId, TOP_CODE_SAMPLES);
    if (codePaths.length === 0) {
      throw new ValidationError(
        'Repo is not indexed yet — wait for indexing to finish (or Resync), then scan again.',
      );
    }
    const ref = { owner: repo.owner, name: repo.name };
    const files = await this.readSample(ref, [...CONFIG_SAMPLE_PATHS, ...codePaths]);
    const { rendered, included } = renderSamples(files, MAX_SAMPLE_CHARS);
    const commitSha = await this.d.clone.currentHead(ref).catch(() => null);

    // PROPOSE — one structured call.
    const { llm, model } = await this.d.model.resolve(workspaceId);
    const res = await llm.completeStructured({
      model,
      schema: ExtractionSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: [
        { role: 'system', content: `${EXTRACTION_SYSTEM_PROMPT}\n\n${EXTRACTION_INJECTION_GUARD}` },
        {
          role: 'user',
          content: buildExtractionUserPrompt(
            repo.fullName,
            rendered,
            included.map((f) => f.path),
          ),
        },
      ],
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });

    // VERIFY — against exactly the files the model was shown.
    const byPath = new Map(included.map((f) => [f.path, f]));
    const verified: VerifiedRule[] = [];
    let ungrounded = 0;
    for (const c of res.data.candidates) {
      const v = verifyCandidate(byPath, c);
      if (v.ok) verified.push(v.rule);
      else ungrounded += 1;
    }
    const existing = await this.d.store.listForRepo(workspaceId, repoId);
    const decided = existing.filter((r) => r.accepted || r.rejectedAt).map((r) => ruleKey(r.rule));
    const { kept, dropped } = mergeAndDedupe(verified, decided);

    const scanMeta = {
      at: this.now().toISOString(),
      commit_sha: commitSha,
      files_sampled: included.length,
      model: res.model || model,
    };
    await this.d.store.replacePending(workspaceId, repoId, kept, scanMeta);

    // The scan meta is stored only on the rows this scan kept; a scan that kept
    // nothing would otherwise answer with an older scan's meta (or none). The
    // reply always describes THIS scan.
    return {
      ...(await this.page(workspaceId, repoId)),
      scan: scanMeta,
      proposed: res.data.candidates.length,
      kept: kept.length,
      dropped_ungrounded: ungrounded,
      dropped_duplicate: dropped,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateConventionInput,
  ): Promise<ConventionCandidate> {
    const current = await this.d.store.getById(workspaceId, id);
    if (!current) throw new NotFoundError(CONVENTION_NOT_FOUND);
    const updated = await this.d.store.update(workspaceId, id, this.patchFor(current, input));
    if (!updated) throw new NotFoundError(CONVENTION_NOT_FOUND);
    const names = await this.d.store.skillNames(workspaceId, updated.details.skill_ids ?? []);
    return toCandidateDto(updated, names);
  }

  async draftSkill(
    workspaceId: string,
    repoId: string,
    conventionIds: string[],
  ): Promise<ConventionSkillDraft> {
    const repo = await this.repo(workspaceId, repoId);
    const rules = await this.acceptedRules(workspaceId, repoId, conventionIds);
    const name = defaultSkillName(repo.name, rules.map((r) => r.category));
    const body = buildSkillBody(name, repo.fullName, rules);
    return {
      name,
      description: defaultSkillDescription(repo.fullName, rules.length),
      body,
      tokens: this.d.tokens.count(body),
    };
  }

  /** Create a NEW skill from accepted conventions (409 when the name is taken). */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<ConventionSkillResult> {
    const repo = await this.repo(workspaceId, repoId);
    const rules = await this.acceptedRules(workspaceId, repoId, input.convention_ids);
    const skill = await this.d.skills.insert(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type ?? CONVENTION_SKILL_TYPE,
      body: buildSkillBody(input.name, repo.fullName, rules),
      enabled: input.enabled,
      source: EXTRACTED_SOURCE,
      evidenceFiles: evidenceFiles(rules),
    });
    await this.d.store.markInSkill(workspaceId, input.convention_ids, skill.id);
    return { skill };
  }

  // ---- internals ------------------------------------------------------------

  private async repo(workspaceId: string, repoId: string): Promise<RepoRefRecord> {
    const repo = await this.d.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError(REPO_NOT_FOUND);
    return repo;
  }

  private async page(workspaceId: string, repoId: string): Promise<ConventionsPage> {
    const records = await this.d.store.listForRepo(workspaceId, repoId);
    const names = await this.d.store.skillNames(
      workspaceId,
      [...new Set(records.flatMap((r) => r.details.skill_ids ?? []))],
    );
    return {
      scan: latestScan(records),
      candidates: records.map((r) => toCandidateDto(r, names)),
    };
  }

  /** Read sample files in order; missing or unreadable files are skipped. */
  private async readSample(
    ref: { owner: string; name: string },
    paths: string[],
  ): Promise<SampledFile[]> {
    const out: SampledFile[] = [];
    for (const path of [...new Set(paths)]) {
      try {
        const raw = await this.d.clone.readFile(ref, path);
        if (raw.trim()) out.push(toSampledFile(path, raw)); // an empty file shows the model nothing
      } catch {
        // Not every repo has every config file; a vanished file is not an error.
      }
    }
    return out;
  }

  /** The selected conventions, all of which must exist in this repo and be accepted. */
  private async acceptedRules(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<SkillRule[]> {
    const unique = [...new Set(ids)];
    const records = await this.d.store.getMany(workspaceId, repoId, unique);
    if (records.length !== unique.length) throw new NotFoundError(CONVENTION_NOT_FOUND);
    if (records.some((r) => !r.accepted)) {
      throw new AppError('not_accepted', 'Only accepted conventions can go into a skill');
    }
    return records.map((r) => ({
      rule: r.rule,
      category: r.details.category ?? 'general',
      bad_example: r.details.bad_example ?? null,
      evidence: r.details.evidence,
    }));
  }

  /** Map an update request to column changes (status ↔ accepted / rejected_at). */
  private patchFor(current: ConventionRecord, input: UpdateConventionInput): ConventionPatch {
    const patch: ConventionPatch = {};
    if (input.rule !== undefined) patch.rule = input.rule;
    if (input.status === 'accepted') Object.assign(patch, { accepted: true, rejectedAt: null });
    if (input.status === 'rejected') Object.assign(patch, { accepted: false, rejectedAt: this.now() });
    if (input.status === 'pending') Object.assign(patch, { accepted: false, rejectedAt: null });

    const touchesDetails =
      input.category !== undefined ||
      input.bad_example !== undefined ||
      input.remove_evidence_index !== undefined;
    if (!touchesDetails) return patch;

    const details: ConventionDetails = { ...current.details, evidence: [...current.details.evidence] };
    if (input.category !== undefined) details.category = input.category;
    if (input.bad_example !== undefined) details.bad_example = input.bad_example?.trim() || null;
    if (input.remove_evidence_index !== undefined) {
      if (input.remove_evidence_index >= details.evidence.length) {
        throw new AppError('bad_evidence_index', 'No evidence at that index');
      }
      if (details.evidence.length <= 1) {
        throw new AppError('last_evidence', 'A convention keeps at least one piece of evidence');
      }
      details.evidence.splice(input.remove_evidence_index, 1);
    }
    patch.details = details;
    return patch;
  }
}
