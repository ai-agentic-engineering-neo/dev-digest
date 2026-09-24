/**
 * Intent use cases (server/specs/05-intent-layer.md): resolve (or reuse) a
 * PR's derived intent as shared review pre-work, and serve it to the
 * `GET`/`refresh` HTTP endpoints. Derivation never throws out of
 * `resolveForReview` — a failure degrades to `{status:'unavailable'}` so the
 * review it feeds is unaffected (see reviews/application/intent-prework.ts).
 */
import { createHash } from 'node:crypto';
import type { Intent, IntentDerivedFrom, IntentTrace, PrIntentRecord, RunEventKind } from '@devdigest/shared';
import { ExternalServiceError, NotFoundError } from '../../../platform/errors.js';
import { sectionMeta, type PromptLogPort } from '../../../platform/prompt-log.js';
import {
  CHANGED_FILES_MAX,
  COMMITS_MAX,
  COMMIT_MAX_CHARS,
  BODY_MAX_CHARS,
  BRANCH_MAX_CHARS,
  DIFF_EXCERPT_MAX_CHARS,
  DOC_MAX_CHARS,
  DOC_TOTAL_MAX_CHARS,
  INTENT_BUDGET_MS,
  TICKET_MAX_CHARS,
  TITLE_MAX_CHARS,
} from '../domain/constants.js';
import { CLASSIFICATION_SYSTEM_PROMPT, classificationTaskText, classificationUserMessage } from '../domain/classification.js';
import {
  buildCacheKeyInput,
  canonicalJson,
  clampIntentText,
  clampScopeList,
  computeConfidence,
  hasDegradedTicketOrDoc,
  hasLoadedTicketOrDoc,
  isSubstantiveBody,
  renderSourcesBlock,
  truncateText,
  type CacheKeyInput,
  type CollectedSource,
} from '../domain/intent.js';
import { extractDocRefs, extractTicketRefs, type DocRef, type SkippedRef, type TicketRef } from '../domain/links.js';
import type {
  IntentCommit,
  IntentModel,
  IntentPull,
  IntentRepo,
  IntentStore,
  PullLookup,
  ResolvedModel,
  Clock,
  DocSource,
  TicketSource,
} from './ports.js';

export interface IntentServiceDeps {
  pulls: PullLookup;
  model: IntentModel;
  docs: DocSource;
  tickets: TicketSource;
  store: IntentStore;
  clock: Clock;
  /** Structured, content-free prompt-assembly logging (platform/prompt-log.ts); undefined = no-op. */
  promptLog?: PromptLogPort;
}

export type IntentLogEvent = { kind: RunEventKind; msg: string; data?: unknown };

export interface ResolveForReviewInput {
  workspaceId: string;
  pull: IntentPull;
  repo: IntentRepo;
  /** Changed file paths (fallback source, only used when derived_from='inferred'). */
  changedFiles: string[];
  /** Raw diff excerpt (fallback source, only when derived_from='inferred'). */
  diffExcerpt?: string;
  /** Ignore any cache hit and re-derive (POST /pulls/:id/intent/refresh). */
  force?: boolean;
  onEvent?: (e: IntentLogEvent) => void;
  signal?: AbortSignal;
}

export type ResolveForReviewResult =
  | { status: 'used'; intent: Intent; trace: IntentTrace; record: PrIntentRecord }
  | { status: 'unavailable'; warning: string };

export interface IntentGetResult {
  intent: PrIntentRecord | null;
  stale: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface DerivationKey {
  resolved: ResolvedModel;
  commits: IntentCommit[];
  ticketRefs: TicketRef[];
  skippedTickets: SkippedRef[];
  docRefs: DocRef[];
  skippedDocs: SkippedRef[];
  cacheInput: CacheKeyInput;
  hash: string;
}

/** Rejects when `signal` aborts, whichever comes first — used so a ticket/doc
 *  fetch stuck past the derivation budget doesn't keep the whole run waiting. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

type EmitFn = (kind: RunEventKind, msg: string, data?: unknown) => void;

/**
 * One shared derivation for a `prId:hash` key, joined by every concurrent
 * caller. `controller` aborts on the 30s budget OR once every ATTACHED
 * participant's own signal has aborted (`abortedCount === participantsCount`)
 * — a caller with no signal never contributes to `abortedCount`, so in that
 * case only the budget can end the flight. `listeners` fans the derivation's
 * log lines out to every attached caller's `emit`.
 */
interface Flight {
  promise: Promise<ResolveForReviewResult>;
  controller: AbortController;
  listeners: Set<EmitFn>;
  participantsCount: number;
  abortedCount: number;
}

export class IntentService {
  /** Single-flight per `prId:hash` — concurrent callers share one in-flight derivation. */
  private readonly inflight = new Map<string, Flight>();

  constructor(private readonly deps: IntentServiceDeps) {}

  /** Shared review pre-work: cache hit → reuse; miss → derive, persist, and return. Never throws. */
  async resolveForReview(input: ResolveForReviewInput): Promise<ResolveForReviewResult> {
    const emit: EmitFn = (kind, msg, data) => input.onEvent?.({ kind, msg, data });
    try {
      const key = await this.computeKey(input.workspaceId, input.pull, input.repo);
      if (!input.force) {
        const stored = await this.deps.store.get(input.pull.id);
        if (stored && stored.input_hash === key.hash) {
          emit('info', `PR intent ready (cached, confidence=${stored.confidence})`);
          return { status: 'used', intent: stored, trace: toIntentTrace(stored, true), record: stored };
        }
      }
      const flightKey = `${input.pull.id}:${key.hash}`;
      let flight = this.inflight.get(flightKey);
      if (!flight) {
        flight = this.startFlight(input, key, flightKey, emit);
      } else {
        flight.listeners.add(emit);
      }
      const detach = this.attachParticipant(flight, input.signal);
      try {
        // Joiners `await` here too (never `return existing` unawaited) so any
        // rejection — theirs or the shared flight's — lands in the catch
        // below and becomes `{status:'unavailable'}`, never escapes.
        return input.signal ? await raceAbort(flight.promise, input.signal) : await flight.promise;
      } finally {
        flight.listeners.delete(emit);
        detach();
      }
    } catch (err) {
      const warning = errorMessage(err);
      emit('info', `warning: intent unavailable — ${warning}`, { warning: 'intent_unavailable' });
      return { status: 'unavailable', warning };
    }
  }

  /** Starts the shared derivation for a new flight key; registers the creator as its first listener. */
  private startFlight(input: ResolveForReviewInput, key: DerivationKey, flightKey: string, creatorEmit: EmitFn): Flight {
    const controller = new AbortController();
    const listeners = new Set<EmitFn>([creatorEmit]);
    const broadcast: EmitFn = (kind, msg, data) => {
      for (const listener of listeners) listener(kind, msg, data);
    };
    const timeout = setTimeout(
      () => controller.abort(new Error(`intent derivation exceeded its ${INTENT_BUDGET_MS}ms budget`)),
      INTENT_BUDGET_MS,
    );
    const promise = this.derive(input, key, broadcast, controller.signal).finally(() => {
      clearTimeout(timeout);
      this.inflight.delete(flightKey);
    });
    const flight: Flight = { promise, controller, listeners, participantsCount: 0, abortedCount: 0 };
    this.inflight.set(flightKey, flight);
    return flight;
  }

  /**
   * Registers one caller as a participant of `flight` (refcount for the
   * "abort only when everyone has aborted" rule) and returns a cleanup that
   * removes its abort listener — call it once the caller stops waiting, to
   * avoid leaking a listener on a long-lived caller signal.
   */
  private attachParticipant(flight: Flight, signal: AbortSignal | undefined): () => void {
    flight.participantsCount += 1;
    if (!signal) return () => {};
    const onAbort = () => {
      flight.abortedCount += 1;
      if (flight.abortedCount >= flight.participantsCount) {
        flight.controller.abort(signal.reason);
      }
    };
    if (signal.aborted) {
      onAbort();
      return () => {};
    }
    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  }

  /** GET /pulls/:id/intent. */
  async get(workspaceId: string, prId: string): Promise<IntentGetResult> {
    const pull = await this.requirePull(workspaceId, prId);
    const stored = await this.deps.store.get(prId);
    if (!stored) return { intent: null, stale: false };
    const repo = await this.deps.pulls.getRepo(pull.repoId);
    const stale = repo ? await this.isStale(workspaceId, pull, repo, stored) : false;
    return { intent: stored, stale };
  }

  /** POST /pulls/:id/intent/refresh — forces re-derivation (ignores the cache). */
  async refresh(workspaceId: string, prId: string): Promise<IntentGetResult> {
    const pull = await this.requirePull(workspaceId, prId);
    const repo = await this.deps.pulls.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const changedFiles = await this.deps.pulls.getChangedFiles(prId);
    const result = await this.resolveForReview({ workspaceId, pull, repo, changedFiles, force: true });
    if (result.status === 'unavailable') {
      throw new ExternalServiceError(`Intent derivation failed: ${result.warning}`, undefined, 'intent_unavailable');
    }
    return { intent: result.record, stale: false };
  }

  private async requirePull(workspaceId: string, prId: string): Promise<IntentPull> {
    const pull = await this.deps.pulls.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** True when re-deriving now, with the CURRENT PR text, would compute a different hash. */
  private async isStale(
    workspaceId: string,
    pull: IntentPull,
    repo: IntentRepo,
    stored: PrIntentRecord,
  ): Promise<boolean> {
    try {
      const key = await this.computeKey(workspaceId, pull, repo);
      return key.hash !== stored.input_hash;
    } catch {
      // Can't resolve the feature model right now (e.g. missing key) — don't
      // report staleness we can't actually verify.
      return false;
    }
  }

  /**
   * Cache-key material (server/specs/05-intent-layer.md, "Cache"). Computed
   * BEFORE any ticket/doc CONTENT fetch or LLM call — only cheap, local reads
   * (resolveFeatureModel, pr_commits) and pure link extraction.
   */
  private async computeKey(workspaceId: string, pull: IntentPull, repo: IntentRepo): Promise<DerivationKey> {
    const resolved = await this.deps.model.resolve(workspaceId);
    const commits = await this.deps.pulls.getCommits(pull.id);
    const commitMessages = commits.map((c) => c.message);
    const { refs: ticketRefs, skipped: skippedTickets } = extractTicketRefs(
      [pull.title, pull.body ?? '', ...commitMessages],
      repo,
    );
    const { refs: docRefs, skipped: skippedDocs } = extractDocRefs([pull.title, pull.body ?? ''], repo);
    const cacheInput = buildCacheKeyInput({
      provider: resolved.provider,
      model: resolved.model,
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      headSha: pull.headSha,
      ticketRefs: ticketRefs.map((t) => t.number),
      docPaths: docRefs.map((d) => d.path),
    });
    const hash = sha256Hex(canonicalJson(cacheInput));
    return { resolved, commits, ticketRefs, skippedTickets, docRefs, skippedDocs, cacheInput, hash };
  }

  /**
   * The expensive path: fetch tickets/docs, classify, clamp, persist.
   * Budget-bound + abortable — `signal` is the shared flight's controller
   * signal (budget timeout ∪ "every attached caller aborted"), owned by the
   * caller (`startFlight`), not by this method.
   */
  private async derive(
    input: ResolveForReviewInput,
    key: DerivationKey,
    emit: (kind: RunEventKind, msg: string, data?: unknown) => void,
    signal: AbortSignal,
  ): Promise<ResolveForReviewResult> {
    // Fetch title/body/tickets/docs FIRST — `derived_from` is decided from
    // what was actually LOADED (server/specs/05-intent-layer.md, "Confidence
    // set by code"), never from what was merely found in text before any
    // fetch was attempted.
    const coreSources = await this.collectCoreSources(input, key, signal);
    const derivedFrom: IntentDerivedFrom =
      isSubstantiveBody(input.pull.body) || hasLoadedTicketOrDoc(coreSources) ? 'explicit' : 'inferred';
    const sources = derivedFrom === 'inferred' ? [...coreSources, ...this.fallbackSources(input, key)] : coreSources;
    const degraded = hasDegradedTicketOrDoc(sources);
    const confidence = computeConfidence(derivedFrom, degraded);
    const sourcesBlock = renderSourcesBlock(sources);
    this.deps.promptLog?.assembled({
      feature: 'intent',
      correlationId: `intent:${input.pull.id}:${key.hash.slice(0, 12)}`,
      provider: key.resolved.provider,
      model: key.resolved.model,
      sections: [
        sectionMeta('system', 'engine', 'trusted', CLASSIFICATION_SYSTEM_PROMPT),
        sectionMeta('task', 'engine', 'trusted', classificationTaskText()),
        sectionMeta('intent_sources', 'repo', 'untrusted', sourcesBlock, { items: sources.length }),
      ],
      verbose: { sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status })) },
    });
    const result = await this.deps.model.classify(
      key.resolved,
      [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: classificationUserMessage(sourcesBlock) },
      ],
      signal,
    );
    const intent: Intent = {
      intent: clampIntentText(result.data.intent),
      in_scope: clampScopeList(result.data.in_scope),
      out_of_scope: clampScopeList(result.data.out_of_scope),
      change_type: result.data.change_type,
      confidence,
      derived_from: derivedFrom,
      sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status, detail: s.detail ?? null })),
    };
    emit(
      'info',
      `PR intent sources: ${sources.filter((s) => s.status === 'used' || s.status === 'truncated').length} used, ` +
        `${sources.filter((s) => s.status === 'skipped').length} skipped, ${sources.filter((s) => s.status === 'failed').length} failed`,
    );
    const record = await this.deps.store.upsert({
      prId: input.pull.id,
      intent,
      headSha: input.pull.headSha,
      inputHash: key.hash,
      promptVersion: key.cacheInput.prompt_version,
      provider: key.resolved.provider,
      model: key.resolved.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      derivedAt: this.deps.clock(),
    });
    emit(
      'result',
      `PR intent derived (confidence=${confidence}, ${result.tokensIn}+${result.tokensOut} tok` +
        `${result.costUsd != null ? `, $${result.costUsd.toFixed(4)}` : ''})`,
    );
    // `record` (the persisted PrIntentRecord) is what GET/refresh answer with —
    // it carries pr_id/head_sha/input_hash/provider/model/usage/etc, which the
    // bare `intent` object above does not.
    return { status: 'used', intent, trace: toIntentTrace(record, false), record };
  }

  /**
   * Fetch title/body/ticket/doc content (never throws — a failure becomes a
   * `failed` source). Each ticket/doc fetch races the derivation's combined
   * budget+caller `signal` so a slow GitHub/git call can't outlive it.
   */
  private async collectCoreSources(
    input: ResolveForReviewInput,
    key: DerivationKey,
    signal: AbortSignal,
  ): Promise<CollectedSource[]> {
    const { pull, repo } = input;
    const sources: CollectedSource[] = [
      { kind: 'title', ref: 'title', status: 'used', content: truncateText(pull.title, TITLE_MAX_CHARS).text },
    ];
    if (pull.body) {
      const { text, truncated } = truncateText(pull.body, BODY_MAX_CHARS);
      sources.push({ kind: 'body', ref: 'body', status: truncated ? 'truncated' : 'used', content: text });
    }

    for (const t of key.ticketRefs) {
      signal.throwIfAborted();
      const res = await raceAbort(this.deps.tickets.read(repo, t.number), signal);
      if (res.ok) {
        const { text, truncated } = truncateText(`${res.title}\n\n${res.body}`, TICKET_MAX_CHARS);
        sources.push({ kind: 'ticket', ref: String(t.number), status: truncated ? 'truncated' : 'used', content: text });
      } else {
        sources.push({ kind: 'ticket', ref: String(t.number), status: 'failed', detail: res.reason });
      }
    }
    for (const s of key.skippedTickets) sources.push({ kind: 'ticket', ref: s.ref, status: 'skipped', detail: s.reason });

    let docCharsLeft = DOC_TOTAL_MAX_CHARS;
    for (const d of key.docRefs) {
      if (docCharsLeft <= 0) {
        sources.push({ kind: 'doc', ref: d.path, status: 'skipped', detail: 'doc total budget reached' });
        continue;
      }
      signal.throwIfAborted();
      const res = await raceAbort(this.deps.docs.read(repo, pull.headSha, d.path), signal);
      if (!res.ok) {
        sources.push({ kind: 'doc', ref: d.path, status: 'failed', detail: res.reason });
        continue;
      }
      const perDoc = Math.min(DOC_MAX_CHARS, docCharsLeft);
      const { text, truncated } = truncateText(res.content, perDoc);
      docCharsLeft -= text.length;
      sources.push({
        kind: 'doc',
        ref: d.path,
        status: truncated || res.truncated ? 'truncated' : 'used',
        content: text,
      });
    }
    for (const s of key.skippedDocs) sources.push({ kind: 'doc', ref: s.ref, status: 'skipped', detail: s.reason });

    return sources;
  }

  /** Commits/branch/changed-files/diff — only added when `derived_from` ends up `inferred`. */
  private fallbackSources(input: ResolveForReviewInput, key: DerivationKey): CollectedSource[] {
    const { pull } = input;
    const sources: CollectedSource[] = [];
    const commitLines = key.commits.slice(0, COMMITS_MAX).map((c) => truncateText(c.message, COMMIT_MAX_CHARS).text);
    if (commitLines.length > 0) {
      sources.push({ kind: 'commits', ref: 'commits', status: 'used', content: commitLines.join('\n') });
    }
    sources.push({ kind: 'branch', ref: 'branch', status: 'used', content: truncateText(pull.branch, BRANCH_MAX_CHARS).text });
    const paths = input.changedFiles.slice(0, CHANGED_FILES_MAX);
    const excerpt = input.diffExcerpt ? truncateText(input.diffExcerpt, DIFF_EXCERPT_MAX_CHARS).text : '';
    const diffContent = [paths.length > 0 ? `Changed files:\n${paths.join('\n')}` : '', excerpt]
      .filter(Boolean)
      .join('\n\n');
    if (diffContent) sources.push({ kind: 'diff', ref: 'changed-files', status: 'used', content: diffContent });
    return sources;
  }
}

/** IntentTrace (server run trace) from a persisted record — cost/usage here, never in agent_runs.cost_usd. */
function toIntentTrace(record: PrIntentRecord, cacheHit: boolean): IntentTrace {
  return {
    status: 'used',
    cache_hit: cacheHit,
    confidence: record.confidence,
    derived_from: record.derived_from,
    change_type: record.change_type,
    provider: record.provider,
    model: record.model,
    tokens_in: record.tokens_in,
    tokens_out: record.tokens_out,
    cost_usd: record.cost_usd,
    sources: record.sources,
  };
}
