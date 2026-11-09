import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { SingleFlight } from '../_shared/single-flight.js';
import {
  BRIEF_INPUT_TOKEN_LIMIT,
  BRIEF_LLM_TIMEOUT_MS,
  BRIEF_MAX_TOKENS,
  BRIEF_SCHEMA_NAME,
  BRIEF_VALIDATION_RETRIES,
  DEFAULT_BRIEF_MODEL,
} from './constants.js';
import { fitBudget } from './domain/budget.js';
import { groundBrief } from './domain/grounding.js';
import { parseHunkRanges } from './domain/hunks.js';
import { blastFacts, blastMapFiles, intentFacts, linkedIssueRefs, missingInputs } from './domain/inputs.js';
import type {
  BriefBlastView,
  BriefChangedFile,
  BriefFacts,
  BriefIntentView,
  BriefReplyData,
  BriefSpecDoc,
  PrBriefResponse,
  StoredBrief,
} from './domain/types.js';
import {
  BriefGenerationError,
  BriefModelNotConfiguredError,
  BriefNoChangedFilesError,
  BriefTooLargeError,
  classifyGenerationError,
} from './errors.js';
import type { BriefDeps, BriefLogger, BriefLogRecord, BriefPullContext } from './ports.js';
import { buildBriefMessages, measureMessages } from './prompt.js';
import { BriefModelReply } from './schemas.js';

const NO_USAGE = { provider: null, model: null, tokensIn: 0, tokensOut: 0, costUsd: null } as const;

export class BriefService {
  private readonly flights = new SingleFlight<StoredBrief>();

  constructor(
    private readonly deps: BriefDeps,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const ctx = await this.requireContext(workspaceId, prId);
    const brief = (await this.deps.briefRepo.get(prId)) ?? null;
    return this.respond(workspaceId, ctx, brief);
  }

  async generate(workspaceId: string, prId: string, logger?: BriefLogger): Promise<PrBriefResponse> {
    // Workspace check BEFORE joining a flight: another workspace can't join.
    const ctx = await this.requireContext(workspaceId, prId);
    const t0 = Date.now();
    const { promise, joined } = this.flights.run(prId, () => this.compute(workspaceId, ctx));
    let brief: StoredBrief;
    try {
      brief = await promise;
    } catch (e) {
      this.log(logger, e instanceof BriefGenerationError ? 'failed' : 'rejected', {
        prId,
        joined,
        reason: e instanceof AppError ? e.code : 'error',
        latencyMs: Date.now() - t0,
        ...NO_USAGE,
        ...(e instanceof BriefGenerationError ? { providerError: e.providerMessage } : {}),
      });
      throw e;
    }
    this.log(logger, 'ready', {
      prId,
      joined,
      reason: null,
      latencyMs: Date.now() - t0,
      provider: brief.usage.provider,
      model: brief.usage.model,
      tokensIn: brief.usage.tokens_in,
      tokensOut: brief.usage.tokens_out,
      costUsd: brief.usage.cost_usd,
    });
    return this.respond(workspaceId, ctx, brief, false);
  }

  private async requireContext(workspaceId: string, prId: string): Promise<BriefPullContext> {
    const ctx = await this.deps.briefRepo.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  private async respond(
    workspaceId: string,
    ctx: BriefPullContext,
    brief: StoredBrief | null,
    generating?: boolean,
  ): Promise<PrBriefResponse> {
    const [changedFiles, override] = await Promise.all([
      this.deps.briefRepo.countChangedFiles(ctx.prId),
      this.deps.briefRepo.featureModelOverride(workspaceId),
    ]);
    return {
      pr_id: ctx.prId,
      model: override ?? { ...DEFAULT_BRIEF_MODEL },
      changed_files: changedFiles,
      generating: generating ?? this.flights.has(ctx.prId),
      outdated: brief !== null && brief.head_sha !== ctx.headSha,
      brief,
    };
  }

  private async compute(workspaceId: string, ctx: BriefPullContext): Promise<StoredBrief> {
    const rows = await this.deps.briefRepo.listChangedFiles(ctx.prId);
    if (rows.length === 0) throw new BriefNoChangedFilesError();

    const [intent, blast, docs] = await Promise.all([
      this.bestEffort<BriefIntentView | null>(() => this.deps.intent.get(workspaceId, ctx.prId), null),
      this.bestEffort<BriefBlastView | null>(() => this.deps.blast.forPull(workspaceId, ctx.prId), null),
      this.bestEffort<{ included: BriefSpecDoc[] }>(
        () => this.deps.projectContext.forBrief(workspaceId, ctx.repoId),
        { included: [] },
      ),
    ]);

    const files: BriefChangedFile[] = rows.map((r) => ({
      path: r.path,
      additions: r.additions,
      deletions: r.deletions,
      role: null,
      hunks: parseHunkRanges(r.patch),
    }));
    const facts: BriefFacts = {
      pr: { number: ctx.number, fullName: ctx.fullName, title: ctx.title, body: ctx.body },
      intent: intentFacts(intent),
      linkedIssues: linkedIssueRefs(intent),
      files,
      blast: blastFacts(blast),
      specDocs: docs.included,
    };
    const fit = fitBudget(facts, (f) => measureMessages(buildBriefMessages(f)), BRIEF_INPUT_TOKEN_LIMIT);
    if (!fit.ok) throw new BriefTooLargeError(fit.tokens, BRIEF_INPUT_TOKEN_LIMIT);

    const choice = (await this.deps.briefRepo.featureModelOverride(workspaceId)) ?? { ...DEFAULT_BRIEF_MODEL };
    let llm: LLMProvider;
    try {
      llm = await this.deps.briefLlm(choice.provider);
    } catch (e) {
      if (e instanceof ConfigError) throw new BriefModelNotConfiguredError(choice.provider);
      throw e;
    }

    let result: StructuredResult<BriefReplyData>;
    try {
      result = await llm.completeStructured<BriefReplyData>({
        model: choice.model,
        schema: BriefModelReply,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: buildBriefMessages(fit.facts),
        temperature: 0,
        maxTokens: BRIEF_MAX_TOKENS,
        timeoutMs: BRIEF_LLM_TIMEOUT_MS,
        maxRetries: BRIEF_VALIDATION_RETRIES,
      });
    } catch (e) {
      throw new BriefGenerationError(
        classifyGenerationError(e),
        e instanceof Error ? e.message : 'Model call failed',
      );
    }

    const grounded = groundBrief(result.data, {
      changed: new Map(files.map((f) => [f.path, f.hunks])),
      blastFiles: blastMapFiles(blast),
    });
    const brief: StoredBrief = {
      ...grounded,
      missing_inputs: missingInputs({ intent, blast }),
      truncated: fit.truncated,
      head_sha: ctx.headSha,
      blast_link_sha: blast && !blast.degraded ? blast.link_sha : null,
      usage: {
        provider: choice.provider,
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
      },
      generated_at: this.clock().toISOString(),
    };
    await this.deps.briefRepo.save(ctx.prId, brief);
    return brief;
  }

  private async bestEffort<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private log(
    logger: BriefLogger | undefined,
    outcome: BriefLogRecord['outcome'],
    f: Omit<BriefLogRecord, 'event' | 'outcome'>,
  ): void {
    if (!logger) return;
    const record: BriefLogRecord = { event: 'brief', outcome, ...f };
    try {
      if (outcome === 'ready') logger.info(record, 'brief generated');
      else logger.warn(record, 'brief generation did not complete');
    } catch {
      // a throwing logger never affects the result
    }
  }
}
