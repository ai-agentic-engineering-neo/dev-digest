/**
 * pr-brief — application service (ring 2). The PR brief:
 *
 *   view()          the stored brief + newest review facts + latest run + stale flag, DB only
 *   generate()      start a run (one per PR), enqueue the job
 *   runGeneration() select inputs in code → exactly one structured model call →
 *                   verify every path and line → store the survivors
 *
 * The verdict, score and counts are never model output: they are read from the
 * newest review at view time.
 */
import { PrBriefDraft, type PrBrief, type PrBriefView, type RunSummary, type RunTrace } from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { BRIEF_CALL_TIMEOUT_MS, GENERATE_JOB_KIND, INVALID_BRIEF_ERROR, PULL_REMOVED_ERROR, STALE_RUN_MS } from './constants.js';
import {
  blastDigest,
  buildMessages,
  buildTrace,
  isSchemaFailure,
  isStale,
  normaliseDraft,
  PrBriefDraftLoose,
  reviewFacts,
  runErrorText,
  selectFiles,
  selectFindings,
  toBrief,
  trimDraft,
  verifyDraft,
  type BriefPrompt,
} from './helpers.js';
import type { GenerateJobPayload, PrBriefDeps, RunUsage } from './ports.js';

/** Contract message plus the cause (parse issues, never raw model text). */
const invalidBrief = (cause: unknown): string =>
  `${INVALID_BRIEF_ERROR}: ${cause instanceof Error ? cause.message : String(cause)}`;

export class PrBriefService {
  constructor(private readonly deps: PrBriefDeps) {
    deps.jobs.register(GENERATE_JOB_KIND, (payload) => this.runGeneration(payload as GenerateJobPayload));
  }

  /** DB only: no model call, no GitHub call, no git read (AC-50). */
  async view(workspaceId: string, prId: string): Promise<PrBriefView> {
    const pull = await this.pullOr404(workspaceId, prId);
    // Run first, then the brief: a run seen as `done` must come with its brief
    // (written in one transaction, so reading them concurrently could straddle the commit).
    const run = await this.deps.repo.getLatestRun(workspaceId, prId);
    const [brief, review] = await Promise.all([
      this.deps.repo.getStored(workspaceId, prId),
      this.deps.repo.getNewestReview(workspaceId, prId),
    ]);
    const stale = brief ? isStale(brief, pull.headSha, review?.facts.review_id ?? null) : false;
    return { brief, review: reviewFacts(review), run: run ?? null, stale };
  }

  /** Start a run. A young running run is returned as is; an orphaned one is failed first. */
  async generate(workspaceId: string, prId: string): Promise<RunSummary> {
    const pull = await this.pullOr404(workspaceId, prId);
    const latest = await this.deps.repo.getLatestRun(workspaceId, prId);
    if (latest?.status === 'running') {
      const age = (this.deps.now?.() ?? new Date()).getTime() - Date.parse(latest.ran_at ?? '');
      if (age < STALE_RUN_MS) return latest;
      await this.deps.repo.failRun(
        workspaceId,
        latest.run_id,
        `Generation did not finish within ${Math.round(STALE_RUN_MS / 60_000)} minutes and was abandoned`,
      );
    }
    const newest = await this.deps.repo.getNewestReview(workspaceId, prId);
    const model = await this.deps.featureModel(workspaceId);
    let run: RunSummary;
    try {
      run = await this.deps.repo.createRun(workspaceId, prId, model);
    } catch (err) {
      // A concurrent request won (the repository reports the one-running-brief index as a conflict).
      if (err instanceof ConflictError) {
        const running = await this.deps.repo.getLatestRun(workspaceId, prId);
        if (running?.status === 'running') return running;
      }
      throw err;
    }
    const payload: GenerateJobPayload = {
      workspaceId,
      prId,
      runId: run.run_id,
      headSha: pull.headSha,
      sourceReviewId: newest?.facts.review_id ?? null,
    };
    await this.deps.jobs.enqueue(workspaceId, GENERATE_JOB_KIND, payload);
    return run;
  }

  /** The background half. Never throws: the run row records success or the error. */
  async runGeneration(payload: GenerateJobPayload): Promise<void> {
    const { workspaceId, prId, runId } = payload;
    const start = Date.now();
    const usage: RunUsage = {};
    const log = this.deps.runLog(runId, prId);
    let provider = '';
    let model = '';
    let prompt: BriefPrompt | null = null;
    let raw = '';
    let prNumber = 0;
    let refs = { kept: 0, total: 0 };
    let callMs = 0;
    let attempts: number | null = null;
    try {
      const pull = await this.deps.repo.getPull(workspaceId, prId);
      if (!pull) {
        await this.deps.repo.failRun(workspaceId, runId, PULL_REMOVED_ERROR);
        return;
      }
      prNumber = pull.number;
      const files = await this.deps.repo.getPrFiles(workspaceId, prId);
      const smartDiff = await this.deps.smartDiff.get(workspaceId, prId).catch(() => null);
      const selected = selectFiles(files, smartDiff);
      const newest = await this.deps.repo.getNewestReview(workspaceId, prId);
      const findings = selectFindings(newest?.findings ?? []);
      const intent = (await this.deps.intent.get(workspaceId, prId).catch(() => undefined)) ?? null;

      let blast: string | null = null;
      if (!this.deps.repoIntelEnabled) {
        log.info('Blast radius skipped: repo intelligence is off');
      } else {
        try {
          const b = await this.deps.blast.get(workspaceId, prId);
          if (b.degraded) log.info(`Blast radius skipped: index ${b.reason ?? 'degraded'}`);
          else blast = blastDigest(b);
        } catch {
          log.info('Blast radius skipped: lookup failed');
        }
      }
      log.info(
        `Inputs: ${selected.included.length}/${selected.total} files with patches (${selected.named.length} named only), ${findings.length} findings, intent ${intent ? 'yes' : 'no'}, blast ${blast ? 'yes' : 'no'}`,
      );

      const choice = await this.deps.featureModel(workspaceId);
      provider = choice.provider;
      model = choice.model;
      usage.provider = provider;
      usage.model = model;
      prompt = buildMessages({ systemPrompt: await this.deps.systemPrompt(), pull, selected, findings, intent, blast });
      const llm = await this.deps.llm(choice.provider);

      log.tool(`Calling ${provider}/${model}`);
      const t0 = Date.now();
      let result;
      try {
        result = await withTimeout(
          llm.completeStructured({
            model,
            schema: PrBriefDraftLoose,
            schemaName: 'PrBriefDraft',
            messages: prompt.messages,
            temperature: 0,
            maxRetries: 0,
            timeoutMs: BRIEF_CALL_TIMEOUT_MS,
            sessionId: `pr-brief:${prId}:${runId}`,
          }),
          BRIEF_CALL_TIMEOUT_MS,
        );
      } catch (err) {
        callMs = Date.now() - t0;
        if (isSchemaFailure(err)) throw new Error(invalidBrief(err), { cause: err });
        throw err;
      }
      callMs = Date.now() - t0;
      raw = result.raw;
      attempts = result.attempts;
      usage.tokensIn = result.tokensIn;
      usage.tokensOut = result.tokensOut;
      usage.costUsd = result.costUsd;
      const draft = PrBriefDraft.safeParse(normaliseDraft(result.data));
      if (!draft.success) throw new Error(invalidBrief(draft.error));

      const verified = verifyDraft(draft.data, files);
      refs = { kept: verified.refsKept, total: verified.refsTotal };
      log.result(`Refs kept ${verified.refsKept}/${verified.refsTotal}; ${verified.droppedItems} item(s) dropped`);
      const final = trimDraft(verified.draft);
      usage.durationMs = Date.now() - start;
      const brief: PrBrief = toBrief(final, {
        generatedAt: this.deps.now?.() ?? new Date(),
        provider,
        model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        headSha: payload.headSha,
        sourceReviewId: payload.sourceReviewId,
        runId,
        filesTotal: selected.total,
        filesIncluded: selected.included.length,
      });
      log.result('Brief stored');
      const trace = buildTrace({
        prNumber,
        provider,
        model,
        system: prompt.system,
        user: prompt.user,
        prDescription: prompt.prDescription,
        intentText: prompt.intentText,
        raw,
        usage,
        callMs,
        attempts,
        refsKept: refs.kept,
        refsTotal: refs.total,
        log: log.logFor(runId),
      });
      await this.deps.repo.completeRun(workspaceId, prId, runId, brief, usage, trace);
    } catch (err) {
      try {
        if (err instanceof NotFoundError) {
          // The PR was removed mid-run: the brief cascaded away; the run row survives with pr_id null.
          await this.deps.repo.failRun(workspaceId, runId, PULL_REMOVED_ERROR);
          return;
        }
        const message = runErrorText(err, provider || undefined);
        log.error(message);
        usage.durationMs = Date.now() - start;
        await this.deps.repo.failRun(workspaceId, runId, message, usage);
        await this.deps.repo.saveTrace(
          workspaceId,
          runId,
          this.failureTrace({ prNumber, provider, model, prompt, raw, usage, callMs, attempts, refs, log: log.logFor(runId) }),
        );
      } catch {
        // The failure path itself failed (DB down): nothing left to record; the stale reaper covers the run.
      }
    }
  }

  private failureTrace(i: {
    prNumber: number;
    provider: string;
    model: string;
    prompt: BriefPrompt | null;
    raw: string;
    usage: RunUsage;
    callMs: number;
    attempts: number | null;
    refs: { kept: number; total: number };
    log: RunTrace['log'];
  }): RunTrace {
    return buildTrace({
      prNumber: i.prNumber,
      provider: i.provider,
      model: i.model,
      system: i.prompt?.system ?? '',
      user: i.prompt?.user ?? '',
      prDescription: i.prompt?.prDescription ?? null,
      intentText: i.prompt?.intentText ?? null,
      raw: i.raw,
      usage: i.usage,
      callMs: i.callMs,
      attempts: i.attempts,
      refsKept: i.refs.kept,
      refsTotal: i.refs.total,
      log: i.log,
    });
  }

  private async pullOr404(workspaceId: string, prId: string) {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }
}
