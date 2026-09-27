import {
  ConventionExtraction,
  type ConventionCandidate,
  type ConventionCategory,
  type ConventionStatus,
  type ConventionsPage,
  type ConventionsSkillPreview,
  type Skill,
  type SkillType,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertCandidate } from './repository.js';
import { sortCandidates, toCandidateDto, toScanDto } from './helpers.js';
import { collectSamples, renderAlreadyDecided, renderSamples } from './sampler.js';
import { renderFacts } from './facts.js';
import { verifyCandidates } from './verifier.js';
import { defaultSkillDescription, renderConventionsSkill } from './render-skill.js';
import {
  DEFAULT_SKILL_NAME,
  EXTRACT_JOB_KIND,
  MAX_CANDIDATES,
  MODEL_TIMEOUT_MS,
  SAMPLE_FILE_COUNT,
  SAMPLE_POOL_SIZE,
  STALE_SCAN_MS,
} from './constants.js';
import type { ConventionFacts } from '../repo-intel/types.js';
import type { ConventionsDeps, ExtractJobPayload } from './types.js';

/**
 * Conventions use cases: scan a repo for house rules, let a human judge them,
 * and fold the accepted ones into a skill an agent can load.
 *
 * The scan is a JOB, not a request: one model call over a dozen files takes
 * tens of seconds, and a closed browser tab must not cancel it. The HTTP route
 * opens the scan row and returns 202; everything below `runExtraction` happens
 * on the JobRunner.
 */

export interface CreateSkillInput {
  candidateIds: string[];
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agentId?: string;
}

/** A scan that cannot produce evidence is a failure with a name, not an empty list. */
export class ScanPreconditionError extends ValidationError {
  constructor(message: string, public readonly reason: string) {
    super(message);
  }
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private deps: ConventionsDeps) {
    this.repo = new ConventionsRepository(deps.db);
  }

  /**
   * Register the extraction handler. Called once at module load from
   * `routes.ts` — the JobRunner keeps the closure, not the service instance.
   */
  registerJobHandler(): void {
    this.deps.jobs.register(EXTRACT_JOB_KIND, async (payload) => {
      await this.runExtraction(payload as ExtractJobPayload);
    });
  }

  // ---- reads --------------------------------------------------------------

  /**
   * Everything the Conventions screen renders in one request.
   *
   * It also closes a dead scan: the screen polls while a scan is `running`, and
   * with Re-scan disabled during a scan, a row left `running` by a restart
   * would otherwise spin the page for ever with no way out.
   */
  async page(workspaceId: string, repoId: string): Promise<ConventionsPage> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    await this.reapStaleScans(repoId);
    const [scan, rows] = await Promise.all([
      this.repo.latestScan(workspaceId, repoId),
      this.repo.listForRepo(workspaceId, repoId),
    ]);
    return {
      scan: scan ? toScanDto(scan) : null,
      candidates: sortCandidates(rows.map(toCandidateDto)),
    };
  }

  // ---- scan ---------------------------------------------------------------

  /**
   * Open a scan and hand it to the JobRunner.
   *
   * The model choice is resolved HERE rather than inside the job so the scan
   * row records what was asked for even if the job never runs — otherwise a
   * failed scan cannot answer "which model was this?".
   */
  async startScan(workspaceId: string, repoId: string): Promise<{ scan_id: string }> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    await this.reapStaleScans(repoId);
    const running = await this.repo.runningScan(repoId);
    if (running) {
      throw new ValidationError('A scan is already running for this repository.');
    }

    const choice = await resolveFeatureModel(
      { settingsRepo: this.deps.settingsRepo },
      workspaceId,
      'conventions',
    );

    let scan;
    try {
      scan = await this.repo.insertScan({
        workspaceId,
        repoId,
        provider: choice.provider,
        model: choice.model,
      });
    } catch {
      // The partial unique index is the real gate: two clicks in the same tick
      // both pass the check above and only one insert survives.
      throw new ValidationError('A scan is already running for this repository.');
    }

    try {
      await this.deps.jobs.enqueue(workspaceId, EXTRACT_JOB_KIND, {
        scanId: scan.id,
        workspaceId,
        repoId,
      } satisfies ExtractJobPayload);
    } catch (err) {
      // No handler / queue refused: close the row now, or the repo is stuck
      // with a `running` scan that nothing will ever finish.
      await this.repo.finishScan(scan.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Could not enqueue the scan job',
      });
      throw err;
    }

    return { scan_id: scan.id };
  }

  /**
   * The job body: sample in code, ask the model once, verify every citation,
   * store what survived.
   *
   * Never throws: a failure is a `failed` scan row carrying its reason, because
   * the screen polls this row and an exception would leave it spinning.
   */
  async runExtraction(payload: ExtractJobPayload): Promise<void> {
    const { scanId, workspaceId, repoId } = payload;
    const scan = await this.repo.getScan(workspaceId, scanId);
    if (!scan) return;
    // A retried job (JobRunner retries twice by default) must not re-run a
    // model call that already produced its answer.
    if (scan.status !== 'running') return;

    try {
      const repo = await this.repo.getRepo(workspaceId, repoId);
      if (!repo) throw new ScanPreconditionError('Repository not found', 'repo_missing');
      if (!repo.clonePath) {
        throw new ScanPreconditionError('The repository has not been cloned yet.', 'repo_not_cloned');
      }

      // Over-fetch: the sampler skips barrels and tiny helpers, and needs the
      // next file of the same interleave to take their slot.
      const rankedFiles = await this.deps.repoIntel.getConventionSamples(repoId, SAMPLE_POOL_SIZE);
      if (rankedFiles.length === 0) {
        // Ranking is what makes the sample representative. Falling back to
        // "some files" would produce conventions from whatever the walker hit
        // first, which is a different (and much worse) product.
        throw new ScanPreconditionError(
          'The repository is not indexed yet, so there is no file ranking to sample from. Re-sync it and try again.',
          'repo_not_indexed',
        );
      }

      const [samples, facts] = await Promise.all([
        collectSamples({
          clonePath: repo.clonePath,
          rankedFiles,
          tokenizer: this.deps.tokenizer,
          maxFiles: SAMPLE_FILE_COUNT,
        }),
        this.loadFacts(repoId),
      ]);

      const headSha = await this.deps.git
        .currentHead({ owner: repo.owner, name: repo.name })
        .catch(() => null);

      const [accepted, rejected] = await Promise.all([
        this.repo.rulesByStatus(workspaceId, repoId, 'accepted'),
        this.repo.rulesByStatus(workspaceId, repoId, 'rejected'),
      ]);

      const system = await loadPromptTemplate('conventions.system.md');
      const decided = renderAlreadyDecided(accepted, rejected);
      const user = [
        `Report the house conventions of \`${repo.fullName}\`.`,
        renderFacts(facts),
        renderSamples(samples),
        decided,
      ]
        .filter((part) => part !== '')
        .join('\n\n');

      const llm = await this.deps.llm(scan.provider as 'openai' | 'anthropic' | 'openrouter');
      const result = await llm.completeStructured({
        model: scan.model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        temperature: 0,
        maxRetries: 1,
        timeoutMs: MODEL_TIMEOUT_MS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const proposed = result.data.candidates.slice(0, MAX_CANDIDATES);
      const files = new Map(
        [...samples.configs, ...samples.code].map((f) => [f.path, f.text] as const),
      );
      const { kept, discarded } = verifyCandidates(proposed, files, {
        knownRules: accepted,
        rejectedRules: rejected,
      });

      const rows: InsertCandidate[] = kept.map((c) => ({
        workspaceId,
        repoId,
        scanId,
        rule: c.rule,
        rationale: c.rationale,
        category: c.category,
        confidence: c.confidence,
        evidencePath: c.evidencePath,
        evidenceLineStart: c.evidenceLineStart,
        evidenceLineEnd: c.evidenceLineEnd,
        evidenceSnippet: c.evidenceSnippet,
        evidenceSha: headSha,
      }));
      await this.repo.replacePending(workspaceId, repoId, rows);

      await this.repo.finishScan(scanId, {
        status: 'done',
        headSha,
        sampleFiles: samples.sampleFiles,
        candidatesTotal: result.data.candidates.length,
        candidatesKept: rows.length,
        discarded: discarded as unknown as Record<string, number>,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd ?? null,
      });
    } catch (err) {
      const reason = err instanceof ScanPreconditionError ? err.reason : null;
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.finishScan(scanId, {
        status: 'failed',
        error: reason ? `${reason}: ${message}` : message,
      });
    }
  }

  /**
   * Whole-index counts for the prompt. Enrichment, never a requirement: a
   * facade that throws (or a test double without the method) costs the scan
   * its facts section, not the scan itself.
   */
  private async loadFacts(repoId: string): Promise<ConventionFacts | null> {
    try {
      return await this.deps.repoIntel.getConventionFacts(repoId);
    } catch {
      return null;
    }
  }

  private async reapStaleScans(repoId: string): Promise<void> {
    await this.repo.failStaleScans(
      repoId,
      new Date(Date.now() - STALE_SCAN_MS),
      `abandoned: still running after ${Math.round(STALE_SCAN_MS / 60_000)} minutes — the server restarted or the model call hung. Run the scan again.`,
    );
  }

  // ---- candidate decisions ------------------------------------------------

  /**
   * Accept / reject / re-open, or edit the rule text.
   *
   * The EVIDENCE is deliberately not editable: it is the record of what the
   * code actually says, and a rule whose citation has been hand-edited is a
   * claim, not evidence.
   */
  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; category?: ConventionCategory; confidence?: number },
  ): Promise<ConventionCandidate> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) throw new NotFoundError('Convention candidate not found');

    const rule = patch.rule?.trim();
    if (rule !== undefined && rule === '') {
      throw new ValidationError('A convention rule cannot be empty.');
    }

    const row = await this.repo.update(workspaceId, id, {
      ...patch,
      ...(rule !== undefined ? { rule } : {}),
    });
    if (!row) throw new NotFoundError('Convention candidate not found');
    return toCandidateDto(row);
  }

  // ---- skill --------------------------------------------------------------

  /**
   * Render what a skill built from these candidates would say. Writes nothing:
   * the user edits this text, and what they confirm is what gets stored.
   */
  async previewSkill(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
  ): Promise<ConventionsSkillPreview> {
    const { repo, candidates, scan } = await this.loadAccepted(workspaceId, repoId, candidateIds);
    const body = renderConventionsSkill({
      name: DEFAULT_SKILL_NAME,
      repoFullName: repo.fullName,
      headSha: scan?.headSha ?? candidates[0]?.evidence_sha ?? null,
      sampleCount: scan?.sampleFiles.length ?? 0,
      scannedOn: scan?.startedAt ? scan.startedAt.toISOString().slice(0, 10) : null,
      candidates,
    });
    return {
      name: DEFAULT_SKILL_NAME,
      description: defaultSkillDescription(repo.fullName, candidates.length),
      type: 'convention',
      body,
      evidence_files: [...new Set(candidates.map((c) => c.evidence_path))],
      candidate_count: candidates.length,
    };
  }

  /**
   * Persist the confirmed text as a skill, stamp the candidates it came from,
   * and optionally link it to an agent.
   *
   * `source: 'extracted'` and `enabled` defaulting to true: unlike an import,
   * this text was produced from the workspace's own code and reviewed by the
   * person clicking the button.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillInput,
  ): Promise<Skill> {
    const { candidates } = await this.loadAccepted(workspaceId, repoId, input.candidateIds);

    const body = input.body.trim();
    if (body === '') throw new ValidationError('Skill body cannot be empty.');

    const evidenceFiles = [...new Set(candidates.map((c) => c.evidence_path))];
    const row = await this.deps.skillsRepo.insert(
      {
        workspaceId,
        name: input.name.trim(),
        description: input.description.trim(),
        type: input.type,
        source: 'extracted',
        body,
        enabled: input.enabled,
        evidenceFiles,
      },
      `Created from ${candidates.length} accepted convention${candidates.length === 1 ? '' : 's'}`,
    );

    await this.repo.markInSkill(
      workspaceId,
      candidates.map((c) => c.id),
      row.id,
    );

    if (input.agentId) {
      const agent = await this.deps.agentsRepo.getById(workspaceId, input.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      const existing = await this.deps.agentsRepo.skillIdsForAgent(input.agentId);
      if (!existing.includes(row.id)) {
        await this.deps.agentsRepo.linkSkill(input.agentId, row.id, existing.length);
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as SkillType,
      source: 'extracted',
      body: row.body,
      enabled: row.enabled,
      version: row.version,
      evidence_files: row.evidenceFiles ?? null,
      agent_count: input.agentId ? 1 : 0,
    };
  }

  /**
   * Load the candidates a skill is being built from, refusing anything that is
   * not an accepted candidate of this repo.
   *
   * Silently skipping a rejected id would be worse than a 422: the user would
   * get a skill missing a rule they thought they had chosen, with nothing
   * saying so.
   */
  private async loadAccepted(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
  ): Promise<{
    repo: { fullName: string };
    candidates: ConventionCandidate[];
    scan: { headSha: string | null; sampleFiles: string[]; startedAt: Date } | undefined;
  }> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    if (candidateIds.length === 0) {
      throw new ValidationError('Select at least one accepted convention.');
    }

    const rows = await this.repo.listByIds(workspaceId, candidateIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of candidateIds) {
      const row = byId.get(id);
      if (!row || row.repoId !== repoId) {
        throw new ValidationError(`Convention ${id} does not belong to this repository.`);
      }
      if (row.status !== 'accepted') {
        throw new ValidationError(`Convention ${id} is ${row.status}, not accepted.`);
      }
    }

    const ordered = candidateIds.map((id) => toCandidateDto(byId.get(id)!));
    const scan = await this.repo.latestScan(workspaceId, repoId);
    return {
      repo,
      candidates: ordered,
      scan: scan
        ? { headSha: scan.headSha, sampleFiles: scan.sampleFiles ?? [], startedAt: scan.startedAt }
        : undefined,
    };
  }
}
