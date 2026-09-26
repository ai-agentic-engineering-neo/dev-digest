/**
 * L03 — IntentService (ring ②). No fastify, no drizzle: cross-module data
 * comes from `this.container.reviewRepo` / `this.container.github()` /
 * `this.container.llm()` / `this.container.featureModel()`, never a sideways
 * import of `../reviews/*` or `../settings/*` (onion-architecture §4).
 */
import type {
  GitHubClient,
  IntentConfidenceBasis,
  IntentSource,
  IntentSourceKind,
  IntentSourceReason,
  IntentSourceStatus,
  IssueMeta,
  PrIntentRecord,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { emitPromptLog, fingerprintText } from '../../platform/prompt-log.js';
import {
  CLASSIFY_MAX_TOKENS,
  CLASSIFY_TEMPERATURE,
  INTENT_SCHEMA_NAME,
  MAX_CHANGED_PATHS,
  MAX_COMMITS,
  MAX_COMMIT_SUBJECT_CHARS,
  MAX_EXTERNAL_LINKS,
  MAX_ISSUE_BODY_CHARS,
  MAX_LINKED_ISSUES,
  MAX_SPEC_CHARS,
  MAX_BODY_CHARS,
  MAX_TOTAL_SOURCE_CHARS,
  ON_DEMAND_MAX_RETRIES,
  ON_DEMAND_TIMEOUT_MS,
  REVIEW_MAX_RETRIES,
  REVIEW_TIMEOUT_MS,
} from './constants.js';
import {
  applyAmbiguity,
  computeConfidence,
  computeInputHash,
  extractLinks,
  normalizeClassification,
  pickSpecFilesFromPaths,
  toIntentRecordDto,
  truncateSource,
  type SourceStatusLookup,
} from './helpers.js';
import {
  buildUserPrompt,
  describeClassifierPrompt,
  PrIntentClassificationSchema,
  SYSTEM_PROMPT,
  type PrIntentClassification,
} from './prompt.js';
import { IntentRepository } from './repository.js';
import type { DeriveOptions, DeriveResult, IntentLayer } from './types.js';

/** One gathered source, before it is trimmed to `IntentSource` for storage. */
interface GatheredSource {
  kind: IntentSourceKind;
  ref: string;
  label: string | null;
  status: IntentSourceStatus;
  reason: IntentSourceReason | null;
  text: string;
  /** Lower = kept first when trimming to MAX_TOTAL_SOURCE_CHARS. */
  priority: number;
}

const PRIORITY: Record<IntentSourceKind, number> = {
  linked_spec: 0,
  spec_in_diff: 1,
  linked_issue: 2,
  description: 3,
  commits: 4,
  branch: 5,
  title: 5,
  changed_paths: 6,
  external_link: 7,
};

export class IntentService implements IntentLayer {
  private repo: IntentRepository;
  private inFlight = new Map<string, Promise<DeriveResult>>();

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.repo.get(workspaceId, prId);
    if (!row) return null;
    const currentHash = computeInputHash(pull.title, pull.body, pull.headSha);
    return toIntentRecordDto(row, currentHash);
  }

  async derive(workspaceId: string, prId: string, opts: DeriveOptions): Promise<DeriveResult> {
    if (!opts.force) {
      const inflight = this.inFlight.get(prId);
      if (inflight) return inflight;
    }
    const promise = this.deriveInternal(workspaceId, prId, opts).finally(() => {
      if (this.inFlight.get(prId) === promise) this.inFlight.delete(prId);
    });
    if (!opts.force) this.inFlight.set(prId, promise);
    return promise;
  }

  private async deriveInternal(
    workspaceId: string,
    prId: string,
    opts: DeriveOptions,
  ): Promise<DeriveResult> {
    const start = Date.now();
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const repoRef: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    const currentHash = computeInputHash(pull.title, pull.body, pull.headSha);
    // L03 — deterministic, joinable to pr_intents.input_hash; needs no
    // randomness port (onion-architecture §5). Shared by the cached and
    // fresh-derive log lines below, and by the prompt-log record.
    const correlationId = `intent:${prId}:${currentHash.slice(0, 12)}`;
    const existing = await this.repo.get(workspaceId, prId);
    if (existing && !opts.force && existing.inputHash === currentHash) {
      const record = toIntentRecordDto(existing, currentHash);
      const usedCount = record.sources.filter((s) => s.status === 'used' || s.status === 'truncated').length;
      opts.onEvent?.(
        'result',
        `Intent ready — ${record.confidence} confidence (${record.confidence_basis}), ${usedCount} source(s) used — cached`,
      );
      opts.logger?.info(
        {
          prId,
          correlation_id: correlationId,
          confidence: record.confidence,
          basis: record.confidence_basis,
          cached: true,
          sources: summarizeSourceCounts(record.sources),
          provider: record.provider,
          model: record.model,
          tokensIn: record.tokens_in,
          tokensOut: record.tokens_out,
          costUsd: record.cost_usd,
          durationMs: Date.now() - start,
        },
        'intent: derived',
      );
      // A cached hit made no LLM call, so there is nothing to describe — no
      // 'prompt: assembled' record here (only the fresh-derive path below).
      return { record, cached: true };
    }

    opts.onEvent?.('tool', 'Deriving PR intent…');

    let github: GitHubClient | undefined;
    try {
      github = await this.container.github();
    } catch {
      github = undefined;
    }

    const files = await this.container.reviewRepo.getPrFiles(prId);
    const commits = await this.container.reviewRepo.getPrCommits(prId);
    const links = extractLinks(pull.body, { owner: repoRef.owner, name: repoRef.name, prNumber: pull.number });

    const gathered: GatheredSource[] = [];

    // ---- linked_spec + spec_in_diff (highest priority) --------------------
    const specPick = pickSpecFilesFromPaths(
      links.specLinks.map((l) => l.path),
      files.map((f) => f.path),
    );
    for (const c of specPick.overflow) {
      gathered.push(mk(c.kind, c.path, null, 'skipped', 'limit_reached', '', PRIORITY[c.kind]));
    }

    const specFetches: { path: string; kind: IntentSourceKind; promise: Promise<string | null> }[] = [];
    if (!github) {
      for (const c of specPick.selected) {
        this.recordUnresolved(gathered, opts, prId, c.kind, c.path, 'github_unavailable', PRIORITY[c.kind]);
      }
    } else {
      for (const c of specPick.selected) {
        specFetches.push({
          path: c.path,
          kind: c.kind,
          promise: github.getFileContent(repoRef, c.path, pull.headSha),
        });
      }
    }

    // ---- linked_issue -------------------------------------------------------
    const issueFetches: { number: number; ref: string; promise: Promise<IssueMeta> }[] = [];
    for (let i = 0; i < links.issues.length; i++) {
      const number = links.issues[i]!.number;
      const ref = `#${number}`;
      if (i >= MAX_LINKED_ISSUES) {
        gathered.push(mk('linked_issue', ref, null, 'skipped', 'limit_reached', '', PRIORITY.linked_issue));
        continue;
      }
      if (!github) {
        this.recordUnresolved(gathered, opts, prId, 'linked_issue', ref, 'github_unavailable', PRIORITY.linked_issue);
        continue;
      }
      issueFetches.push({ number, ref, promise: github.getIssue(repoRef, number) });
    }

    // ---- run every GitHub fetch concurrently (issues and spec files together),
    //      then apply the settled results back in deterministic candidate order --
    const [specResults, issueResults] = await Promise.all([
      Promise.allSettled(specFetches.map((f) => f.promise)),
      Promise.allSettled(issueFetches.map((f) => f.promise)),
    ]);

    specResults.forEach((result, i) => {
      const { path, kind } = specFetches[i]!;
      if (result.status === 'rejected') {
        this.recordUnresolved(gathered, opts, prId, kind, path, 'fetch_failed', PRIORITY[kind]);
        return;
      }
      const content = result.value;
      if (content == null) {
        this.recordUnresolved(gathered, opts, prId, kind, path, 'not_found', PRIORITY[kind]);
        return;
      }
      const t = truncateSource(content, MAX_SPEC_CHARS);
      gathered.push(mk(kind, path, null, t.status, null, t.text, PRIORITY[kind]));
    });

    issueResults.forEach((result, i) => {
      const { ref } = issueFetches[i]!;
      if (result.status === 'rejected') {
        this.recordUnresolved(gathered, opts, prId, 'linked_issue', ref, 'not_found', PRIORITY.linked_issue);
        return;
      }
      const issue = result.value;
      const body = truncateSource(issue.body ?? '', MAX_ISSUE_BODY_CHARS);
      const text = `${issue.title}\n${body.text}`;
      gathered.push(mk('linked_issue', ref, issue.title, body.status, null, text, PRIORITY.linked_issue));
    });

    // ---- external links (never fetched) --------------------------------------
    for (let i = 0; i < links.externalLinks.length && i < MAX_EXTERNAL_LINKS; i++) {
      const l = links.externalLinks[i]!;
      this.recordUnresolved(gathered, opts, prId, 'external_link', l.ref, l.reason, PRIORITY.external_link);
    }

    // ---- description ---------------------------------------------------------
    if (pull.body && pull.body.trim().length > 0) {
      const t = truncateSource(pull.body, MAX_BODY_CHARS);
      gathered.push(mk('description', 'PR description', null, t.status, null, t.text, PRIORITY.description));
    } else {
      gathered.push(mk('description', 'PR description', null, 'skipped', 'empty', '', PRIORITY.description));
    }

    // ---- commits ---------------------------------------------------------------
    if (commits.length > 0) {
      const subjects = commits
        .slice(0, MAX_COMMITS)
        .map((c) => c.message.split('\n')[0]!.slice(0, MAX_COMMIT_SUBJECT_CHARS));
      const truncatedByCap = commits.length > MAX_COMMITS;
      const text = subjects.join('\n');
      gathered.push(
        mk(
          'commits',
          `${commits.length} commit(s)`,
          null,
          truncatedByCap ? 'truncated' : 'used',
          null,
          text,
          PRIORITY.commits,
        ),
      );
    } else {
      gathered.push(mk('commits', '0 commits', null, 'skipped', 'empty', '', PRIORITY.commits));
    }

    // ---- branch / title (always present) --------------------------------------
    gathered.push(mk('branch', pull.branch, null, 'used', null, pull.branch, PRIORITY.branch));
    gathered.push(mk('title', pull.title, null, 'used', null, pull.title, PRIORITY.title));

    // ---- changed_paths ----------------------------------------------------------
    if (files.length > 0) {
      const paths = files.slice(0, MAX_CHANGED_PATHS).map((f) => f.path);
      const truncatedByCap = files.length > MAX_CHANGED_PATHS;
      gathered.push(
        mk(
          'changed_paths',
          `${files.length} file(s) changed`,
          null,
          truncatedByCap ? 'truncated' : 'used',
          null,
          paths.join('\n'),
          PRIORITY.changed_paths,
        ),
      );
    } else {
      gathered.push(mk('changed_paths', '0 files changed', null, 'skipped', 'empty', '', PRIORITY.changed_paths));
    }

    // ---- total budget: drop the lowest-priority overflow -----------------------
    applyTotalBudget(gathered);

    // ---- classify ---------------------------------------------------------------
    const classifierSources = gathered
      .filter((g) => g.status === 'used' || g.status === 'truncated')
      .map((g) => ({ kind: g.kind, ref: g.ref, text: g.text, truncated: g.status === 'truncated' }));

    const choice = await this.container.featureModel(workspaceId, 'review_intent');
    const llm = await this.container.llm(choice.provider);
    opts.onEvent?.('tool', `Classifying intent with ${choice.provider}/${choice.model}`);
    const timeoutMs = opts.budget === 'on-demand' ? ON_DEMAND_TIMEOUT_MS : REVIEW_TIMEOUT_MS;
    const maxRetries = opts.budget === 'on-demand' ? ON_DEMAND_MAX_RETRIES : REVIEW_MAX_RETRIES;

    const prRef = { number: pull.number, owner: repoRef.owner, repo: repoRef.name };
    const userPrompt = buildUserPrompt(prRef, classifierSources);

    // L03 — one record per non-cached classification, emitted BEFORE the LLM
    // call so it's there even if the call fails (see reviewer-core's same
    // decision for the review path). `emitPromptLog` never throws.
    if (opts.logger) {
      const mode = this.container.config.promptLog;
      emitPromptLog(
        opts.logger,
        {
          feature: 'intent',
          scope: 'classifier',
          correlation_id: correlationId,
          pr_id: prId,
          ...(opts.runIds ? { run_ids: opts.runIds } : {}),
          provider: choice.provider,
          model: choice.model,
          ...describeClassifierPrompt(prRef, classifierSources, mode === 'verbose' ? { fingerprint: fingerprintText } : {}),
        },
        mode,
      );
    }

    let result;
    try {
      result = await llm.completeStructured<PrIntentClassification>({
        model: choice.model,
        schema: PrIntentClassificationSchema,
        schemaName: INTENT_SCHEMA_NAME,
        temperature: CLASSIFY_TEMPERATURE,
        maxTokens: CLASSIFY_MAX_TOKENS,
        timeoutMs,
        maxRetries,
        sessionId: `${repoRef.owner}/${repoRef.name}#${pull.number}:intent`,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      throw new ExternalServiceError(`Intent classification failed: ${(err as Error).message}`);
    }

    const normalized = normalizeClassification(result.data);
    const sourceLookup: SourceStatusLookup[] = gathered.map((g) => ({ kind: g.kind, status: g.status }));
    const base = computeConfidence(sourceLookup, pull.body, pull.title);
    const { level: confidence, downgraded } = applyAmbiguity(base.level, result.data.ambiguity);

    const sources: IntentSource[] = gathered.map((g) => ({
      kind: g.kind,
      ref: g.ref,
      label: g.label,
      status: g.status,
      reason: g.reason,
    }));

    const row = await this.repo.upsert(workspaceId, prId, {
      intent: normalized.intent,
      inScope: normalized.inScope,
      outOfScope: normalized.outOfScope,
      confidence,
      confidenceBasis: base.basis as IntentConfidenceBasis,
      downgraded,
      sources,
      inputHash: currentHash,
      headSha: pull.headSha,
      provider: choice.provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });
    // The PR was re-checked at the top of this method, so `undefined` here
    // means it was removed from the workspace mid-derive (onion-architecture
    // §6: the repository never throws, the service does).
    if (!row) throw new NotFoundError('Pull request not found');

    const durationMs = Date.now() - start;
    const usedCount = sources.filter((s) => s.status === 'used' || s.status === 'truncated').length;
    const costPart = result.costUsd != null ? `$${result.costUsd.toFixed(4)}` : 'cost unknown';
    opts.onEvent?.(
      'result',
      `Intent ready — ${confidence} confidence (${base.basis}), ${usedCount} source(s) used — ${result.tokensIn}→${result.tokensOut} tokens, ${costPart}`,
    );
    opts.logger?.info(
      {
        prId,
        correlation_id: correlationId,
        confidence,
        basis: base.basis,
        cached: false,
        sources: summarizeSourceCounts(sources),
        provider: choice.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs,
      },
      'intent: derived',
    );

    const record = toIntentRecordDto(row, currentHash);
    return { record, cached: false };
  }

  /**
   * One place for every source that ends `unresolved`: pushes it to
   * `gathered` and emits BOTH the Live Log `info` line and the pino `warn`
   * (§ Logging / observability) — every unresolved reason goes through here
   * so none can silently skip one of the two.
   */
  private recordUnresolved(
    gathered: GatheredSource[],
    opts: DeriveOptions,
    prId: string,
    kind: IntentSourceKind,
    ref: string,
    reason: IntentSourceReason,
    priority: number,
  ): void {
    gathered.push(mk(kind, ref, null, 'unresolved', reason, '', priority));
    opts.onEvent?.('info', `Intent source ${ref} not fetched: ${reason}`);
    opts.logger?.warn({ prId, ref, reason }, 'intent: source unresolved');
  }
}

function mk(
  kind: IntentSourceKind,
  ref: string,
  label: string | null,
  status: IntentSourceStatus,
  reason: IntentSourceReason | null,
  text: string,
  priority: number,
): GatheredSource {
  return { kind, ref, label, status, reason, text, priority };
}

/** Trim `used`/`truncated` sources to MAX_TOTAL_SOURCE_CHARS, dropping the
    LOWEST-priority ones first (they become `skipped` / `limit_reached`). */
function applyTotalBudget(gathered: GatheredSource[]): void {
  const eligible = gathered
    .map((g, index) => ({ g, index }))
    .filter(({ g }) => g.status === 'used' || g.status === 'truncated')
    .sort((a, b) => a.g.priority - b.g.priority);

  let total = 0;
  for (const { g } of eligible) {
    total += g.text.length;
    if (total > MAX_TOTAL_SOURCE_CHARS) {
      g.status = 'skipped';
      g.reason = 'limit_reached';
      g.text = '';
    }
  }
}

function summarizeSourceCounts(sources: IntentSource[]): {
  used: number;
  truncated: number;
  unresolved: number;
  skipped: number;
} {
  return {
    used: sources.filter((s) => s.status === 'used').length,
    truncated: sources.filter((s) => s.status === 'truncated').length,
    unresolved: sources.filter((s) => s.status === 'unresolved').length,
    skipped: sources.filter((s) => s.status === 'skipped').length,
  };
}
