import type {
  FeatureModelChoice,
  FeatureModelId,
  GitClient,
  GitHubClient,
  IntentSource,
  LLMProvider,
  PrIntentRecord,
  Provider,
  RepoRef,
  StructuredResult,
  UnifiedDiff,
  WebFetchClient,
} from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import type { IntentRepository } from './repository.js';
import {
  INPUT_TOKEN_BUDGET,
  MAX_DESCRIPTION_CHARS,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_CHARS,
  SOURCE_TIMEOUT_MS,
} from './constants.js';
import {
  buildMissingContext,
  deriveConfidence,
  fitToBudget,
  normalizeClassification,
  outlineFromDiff,
  outlineFromPatches,
  parseRefs,
  redactRef,
  renderOutline,
  toPrIntentRecord,
  type BudgetSection,
  type OutlineFile,
} from './helpers.js';
import { buildIntentMessages, describeIntentPrompt, IntentClassification } from './prompt.js';
import {
  createPromptMeasure,
  logPromptAssembled,
  type PromptLogMode,
} from '../../platform/prompt-log.js';

/**
 * Narrow dependency set of the intent use cases. Declared structurally, with
 * only `@devdigest/shared` ports and the module's own repository type, so this
 * file never imports `Container`: `container.ts` imports this service, and a
 * `Container`-typed constructor would close the cycle `arch:check` forbids
 * (server/INSIGHTS.md, 2026-09-22). The container builds it.
 */
export interface IntentDeps {
  repo: IntentRepository;
  git: GitClient;
  github: () => Promise<GitHubClient>;
  webFetch: WebFetchClient;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveFeatureModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  tokenizer: { count(text: string): number };
  /** Effective PROMPT_LOG mode: `off` skips the `prompt.assembled` record and its measuring. */
  promptLogMode: PromptLogMode;
}

/**
 * Where the classifier's content-free `prompt.assembled` record goes, and the
 * ids that tie it to a review click or a request. Optional on every use case:
 * without it nothing is logged.
 */
export interface IntentPromptLogContext {
  logger: { info(obj: unknown, msg?: string): void };
  correlation: {
    pr_id: string;
    round_id?: string | null;
    run_ids?: string[];
    request_id?: string;
  };
}

/** The slice of a PR the derivation needs (no DB row type, so callers need not share one). */
export interface IntentPrInput {
  id: string;
  title: string;
  body: string | null | undefined;
  headSha: string;
  base: string;
  repo: RepoRef;
}

/** Content-free structured log sink (`RunLogger`, or a request-log adapter). */
export interface IntentLog {
  info(msg: string, data?: unknown): void;
}

const CLASSIFIER_TIMEOUT_MS = 60_000;

/** Every fetched source ends as a prompt section or an `unavailable` ledger entry. */
interface SourceItem {
  kind: IntentSource['kind'];
  /** Redacted reference (what is stored and logged). */
  ref: string;
  label: string;
  section: BudgetSection | null;
  /** Short reason code for an unavailable source; logged, never stored. */
  reason?: string;
}

function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = /[\uD800-\uDBFF]/.test(text[max - 1] ?? '') ? max - 1 : max;
  return text.slice(0, end);
}

/** A short, content-free reason code for a failed source fetch. */
function reasonOf(err: unknown): string {
  if (err instanceof TimeoutError) return 'timeout';
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : e?.statusCode;
  if (typeof status === 'number') return `http_${status}`;
  if (typeof e?.code === 'string' && /^[a-z][a-z_]{0,39}$/.test(e.code)) return e.code;
  return 'error';
}

/**
 * Build a fetched section. `label` is the trusted, server-built heading
 * (`IntentPromptSection`'s invariant: kind + ordinal only, never body-derived
 * text). The concrete reference the label deliberately omits (an issue's
 * `owner/repo#N`, a repo path, a redacted URL) is instead prepended to the
 * section's own text as a `Reference: <ref>` line, so it still reaches the
 * model — but only inside the `wrapUntrusted` block `buildIntentMessages`
 * wraps this text in, never outside it next to the heading.
 */
function fetchedSection(
  kind: 'issue' | 'repo_doc' | 'web',
  label: string,
  ref: string,
  raw: string,
  alreadyTruncated: boolean,
): BudgetSection | null {
  if (!raw.trim()) return null;
  const withRef = `Reference: ${ref}\n\n${raw}`;
  const text = capText(withRef, MAX_SOURCE_CHARS);
  return {
    label,
    kind,
    ref,
    text,
    status: alreadyTruncated || text.length < withRef.length ? 'truncated' : 'ok',
  };
}

export class IntentService {
  constructor(private deps: IntentDeps) {}

  /** GET — the stored record, or `null` when none was derived yet. 404 when the PR is not in the workspace. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.deps.repo.get(workspaceId, prId);
    return row ? toPrIntentRecord(row) : null;
  }

  /**
   * Executor entry point: reuse the stored intent while it matches the PR's
   * head SHA, otherwise derive and store a new one. `diff` may be omitted, in
   * which case the outline comes from the persisted file patches.
   */
  async getOrDerive(
    workspaceId: string,
    pr: IntentPrInput,
    diff: UnifiedDiff | undefined,
    log?: IntentLog,
    promptLog?: IntentPromptLogContext,
  ): Promise<PrIntentRecord> {
    const stored = await this.deps.repo.get(workspaceId, pr.id);
    if (stored && stored.headSha === pr.headSha) {
      log?.info('Intent reused', { headSha: pr.headSha });
      return toPrIntentRecord(stored);
    }
    const outline = diff
      ? outlineFromDiff(diff)
      : await this.outlineFromStoredPatches(workspaceId, pr.id);
    return this.derive(workspaceId, pr, outline, log, promptLog);
  }

  /** POST recompute — always derive (the head SHA cache is bypassed). */
  async recompute(
    workspaceId: string,
    prId: string,
    log?: IntentLog,
    promptLog?: IntentPromptLogContext,
  ): Promise<PrIntentRecord> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.deps.repo.getRepo(workspaceId, pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const repo: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    let outline: OutlineFile[] | null = null;
    try {
      const diff = await this.deps.git.diff(repo, pull.base, pull.headSha);
      if (diff.files.length > 0) outline = outlineFromDiff(diff);
    } catch {
      /* no clone / unknown ref: fall back to the persisted patches */
    }
    outline ??= outlineFromPatches(await this.deps.repo.getPrFilePatches(pull.id));

    return this.derive(
      workspaceId,
      { id: pull.id, title: pull.title, body: pull.body, headSha: pull.headSha, base: pull.base, repo },
      outline,
      log,
      promptLog,
    );
  }

  // ------------------------------------------------------------------ internals

  /**
   * Emit the content-free `prompt.assembled` record for the classifier prompt.
   * Best-effort like every enrichment step: measuring or logging can never fail
   * the derivation.
   */
  private logPrompt(
    promptLog: IntentPromptLogContext | undefined,
    sections: Parameters<typeof describeIntentPrompt>[0],
    title: string,
    provider: string,
    model: string,
  ): void {
    const mode = this.deps.promptLogMode;
    if (!promptLog || mode === 'off') return;
    try {
      logPromptAssembled(
        promptLog.logger,
        {
          component: 'intent_classifier',
          provider,
          model,
          correlation: promptLog.correlation,
          sections: describeIntentPrompt(sections, title, createPromptMeasure(mode, this.deps.tokenizer)),
        },
        mode,
      );
    } catch {
      /* never fail a derivation over a log line */
    }
  }

  private async outlineFromStoredPatches(workspaceId: string, prId: string): Promise<OutlineFile[]> {
    // `pr_files` has no workspace column: prove the PR belongs to the workspace first.
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return outlineFromPatches(await this.deps.repo.getPrFilePatches(prId));
  }

  /** Fetch every referenced source; a failed source never throws, it becomes an `unavailable` ledger entry. */
  private async collectSources(pr: IntentPrInput, outline: OutlineFile[]): Promise<SourceItem[]> {
    const description = (pr.body ?? '').trim();
    const items: SourceItem[] = [];

    if (description) {
      const text = capText(description, MAX_DESCRIPTION_CHARS);
      items.push({
        kind: 'description',
        ref: 'description',
        label: 'PR description',
        section: {
          label: 'PR description',
          kind: 'description',
          ref: 'description',
          text,
          status: text.length < description.length ? 'truncated' : 'ok',
        },
      });
    }

    const refs = parseRefs(description, pr.repo);

    const jobs: Promise<SourceItem>[] = [
      ...refs.issues.map(async (issue, idx): Promise<SourceItem> => {
        const ref = `${issue.owner}/${issue.name}#${issue.number}`;
        // Label is kind + ordinal ONLY (IntentPromptSection invariant): the
        // owner/repo#N reference itself is body-derived and goes inside the
        // wrapped text instead, never in a heading rendered outside it.
        const label = `Issue ${idx + 1}`;
        try {
          const meta = await withTimeout(
            (async () => {
              const gh = await this.deps.github();
              return gh.getIssue({ owner: issue.owner, name: issue.name }, issue.number);
            })(),
            SOURCE_TIMEOUT_MS,
          );
          const section = fetchedSection(
            'issue',
            label,
            ref,
            `${meta.title}\n\n${meta.body ?? ''}`,
            false,
          );
          return { kind: 'issue', ref, label, section, ...(section ? {} : { reason: 'empty' }) };
        } catch (err) {
          return { kind: 'issue', ref, label, section: null, reason: reasonOf(err) };
        }
      }),
      ...refs.docs.map(async (path, idx): Promise<SourceItem> => {
        // Same rule as the issue label above: the path is body-derived and
        // moves inside the wrapped text as `Reference: <path>`.
        const label = `Repo doc ${idx + 1}`;
        try {
          const text = await withTimeout(
            this.deps.git.readFileAt(pr.repo, pr.headSha, path),
            SOURCE_TIMEOUT_MS,
          );
          const section = fetchedSection('repo_doc', label, path, text, false);
          return { kind: 'repo_doc', ref: path, label, section, ...(section ? {} : { reason: 'empty' }) };
        } catch (err) {
          return { kind: 'repo_doc', ref: path, label, section: null, reason: reasonOf(err) };
        }
      }),
      ...refs.urls.map(async (url, idx): Promise<SourceItem> => {
        const ref = redactRef(url);
        // Same rule: the redacted URL is body-derived and moves inside the
        // wrapped text as `Reference: <ref>` (never a query string, per redactRef).
        const label = `Web page ${idx + 1}`;
        try {
          const res = await withTimeout(
            this.deps.webFetch.fetchText(url, { timeoutMs: SOURCE_TIMEOUT_MS, maxBytes: MAX_SOURCE_BYTES }),
            SOURCE_TIMEOUT_MS,
          );
          const section = fetchedSection('web', label, ref, res.text, res.status === 'truncated');
          return { kind: 'web', ref, label, section, ...(section ? {} : { reason: 'empty' }) };
        } catch (err) {
          return { kind: 'web', ref, label, section: null, reason: reasonOf(err) };
        }
      }),
    ];
    // Each job already catches its own failure; allSettled keeps the contract explicit.
    for (const r of await Promise.allSettled(jobs)) {
      if (r.status === 'fulfilled') items.push(r.value);
    }

    if (outline.length > 0) {
      const text = renderOutline(outline);
      items.push({
        kind: 'diff_outline',
        ref: 'diff',
        label: 'Changed files outline',
        section: {
          label: 'Changed files outline',
          kind: 'diff_outline',
          ref: 'diff',
          text,
          status: 'ok',
          outline,
        },
      });
    }
    return items;
  }

  private async derive(
    workspaceId: string,
    pr: IntentPrInput,
    outline: OutlineFile[],
    log?: IntentLog,
    promptLog?: IntentPromptLogContext,
  ): Promise<PrIntentRecord> {
    const { deps } = this;
    const items = await this.collectSources(pr, outline);

    const present = items.filter((i): i is SourceItem & { section: BudgetSection } => i.section !== null);
    const fitted = fitToBudget(
      present.map((i) => i.section),
      (t) => deps.tokenizer.count(t),
      INPUT_TOKEN_BUDGET,
    );
    const fittedByItem = new Map<SourceItem, BudgetSection>(present.map((item, idx) => [item, fitted[idx]!]));

    const sources: IntentSource[] = items.map((i) => {
      const s = fittedByItem.get(i);
      return s
        ? { kind: i.kind, ref: i.ref, status: s.status, chars: s.text.length }
        : { kind: i.kind, ref: i.ref, status: 'unavailable', chars: 0 };
    });

    const promptSections = fitted.map((s) => ({ label: s.label, kind: s.kind, text: s.text }));
    const messages = buildIntentMessages(promptSections, pr.title);

    const { provider, model } = await deps.resolveFeatureModel(workspaceId, 'review_intent');
    // Before the call, so a classification that later fails is still on record.
    this.logPrompt(promptLog, promptSections, pr.title, provider, model);
    let result: StructuredResult<IntentClassification>;
    try {
      const llm = await deps.llm(provider);
      result = await llm.completeStructured({
        model,
        schema: IntentClassification,
        schemaName: 'PrIntentClassification',
        messages,
        temperature: 0,
        maxRetries: 2,
        timeoutMs: CLASSIFIER_TIMEOUT_MS,
      });
    } catch (err) {
      // Config problems already are AppErrors the envelope maps; anything else is a provider failure.
      // The message carries only a reason code: provider errors can echo request content.
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Intent classification failed (${reasonOf(err)})`);
    }

    const classified = normalizeClassification(result.data);
    const confidence = deriveConfidence(sources, (pr.body ?? '').trim());
    const missingContext = buildMissingContext(sources, classified.missing_context);

    await deps.repo.upsert({
      prId: pr.id,
      workspaceId,
      intent: classified.intent,
      inScope: classified.in_scope,
      outOfScope: classified.out_of_scope,
      confidence,
      sources,
      missingContext,
      headSha: pr.headSha,
      provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    const row = await deps.repo.get(workspaceId, pr.id);
    if (!row) throw new AppError('intent_not_persisted', 'Intent was not persisted', 500);

    log?.info('Intent derived', {
      provider,
      model: result.model,
      files: outline.length,
      hunkHeaders: outline.reduce((n, f) => n + f.hunkHeaders.length, 0),
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      sources: items.map((i, idx) => ({ ...sources[idx]!, ...(i.reason ? { reason: i.reason } : {}) })),
      confidence,
    });

    return toPrIntentRecord(row);
  }
}
