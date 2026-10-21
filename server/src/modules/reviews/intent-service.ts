/**
 * reviews: PR intent service (ring 2). Derives why a PR exists before the
 * agents run: cache check, gather sources (GitHub issues, same-repo plans and
 * specs), one `deriveIntent` call on the `review_intent` feature model, save.
 *
 * Takes explicit deps (no Container). `ensureIntent` never throws: a missing
 * key, a timeout or GitHub being down only means the review runs without an
 * intent. `refresh` throws `ExternalServiceError`; `get` throws `NotFoundError`.
 */
import type { IntentSource, PrIntentRecord, Provider } from '@devdigest/shared';
import { deriveIntent, INTENT_PROMPT_VERSION } from '@devdigest/reviewer-core';
import { ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { sourceHash } from '../../platform/intent-hash.js';
import {
  INTENT_BODY_CHARS,
  INTENT_BRANCH_CHARS,
  INTENT_COMMIT_CHARS,
  INTENT_COMMIT_LIMIT,
  INTENT_DOC_CHARS,
  INTENT_ISSUE_BODY_CHARS,
  INTENT_ISSUE_TITLE_CHARS,
  INTENT_LLM_TIMEOUT_MS,
  INTENT_MAX_DOCS,
  INTENT_PATH_LIMIT,
  INTENT_SOURCE_TIMEOUT_MS,
  INTENT_TITLE_CHARS,
  INTENT_TOTAL_TIMEOUT_MS,
} from './constants.js';
import {
  applyBudget,
  commitSubject,
  computeConfidence,
  extractRefs,
  hasLinkedDoc,
  isPlanOrSpecPath,
  normaliseRepoPath,
  renderBasis,
  type BudgetText,
  type DocRef,
  type IssueRef,
} from './intent-sources.js';
import type {
  EnsureIntentResult,
  IntentDeps,
  IntentInputs,
  IntentLog,
  StoredIntent,
} from './ports.js';

const NOOP_LOG: IntentLog = { info: () => undefined, tool: () => undefined, result: () => undefined };

interface Derived {
  record: StoredIntent;
  cached: boolean;
  ms: number;
}

const short = (msg: string): string => msg.replace(/\s+/g, ' ').slice(0, 200);

function ago(from: Date | null, now: Date): string {
  if (!from) return 'earlier';
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export class IntentService {
  constructor(private readonly deps: IntentDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** The stored intent for a PR with `stale` computed against the current inputs. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    const inputs = await this.deps.repo.getInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    const stored = await this.deps.repo.get(workspaceId, prId);
    if (!stored) throw new NotFoundError('No intent derived for this pull request yet');
    const { provider, model } = await this.deps.featureModel(workspaceId);
    const stale = this.hashFor(inputs, provider, model) !== stored.sourceHash;
    return this.toRecord(stored, stale);
  }

  /** Force a re-derivation (ignores the cache). */
  async refresh(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    try {
      const { record } = await this.derive(workspaceId, prId, { force: true, log: NOOP_LOG });
      return this.toRecord(record, false);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new ExternalServiceError(`Intent derivation failed: ${short((err as Error).message)}`);
    }
  }

  /** Derive (or reuse) the intent for a review run. Never throws. */
  async ensureIntent(
    workspaceId: string,
    prId: string,
    opts: { changedPaths?: string[]; log: IntentLog },
  ): Promise<EnsureIntentResult> {
    const t0 = Date.now();
    try {
      const { record, cached, ms } = await this.derive(workspaceId, prId, {
        force: false,
        log: opts.log,
        ...(opts.changedPaths ? { changedPaths: opts.changedPaths } : {}),
      });
      const used = record.sources.filter(
        (s) => (s.status === 'used' || s.status === 'truncated') && ['github_issue', 'repo_doc', 'github_doc'].includes(s.kind),
      );
      return {
        status: 'ok',
        part: {
          intent: record.intent,
          in_scope: record.inScope,
          out_of_scope: record.outOfScope,
          confidence: record.confidence,
          basis: renderBasis(record.sources),
        },
        cached,
        model: `${record.provider ?? ''}/${record.model ?? ''}`,
        ms,
        usedRefs: used.map((s) => s.ref),
      };
    } catch (err) {
      // Info, never error: an error event toasts in the client and the review goes on.
      opts.log.info(`Intent unavailable: ${short((err as Error).message)}; reviewing without intent`, {
        reason: short((err as Error).message),
      });
      return { status: 'failed', ms: Date.now() - t0 };
    }
  }

  // ---------------------------------------------------------------------------

  private hashFor(inputs: IntentInputs, provider: string, model: string): string {
    return sourceHash({
      promptVersion: INTENT_PROMPT_VERSION,
      provider,
      model,
      title: inputs.title,
      body: inputs.body,
      branch: inputs.branch,
      headSha: inputs.headSha,
    });
  }

  private toRecord(s: StoredIntent, stale: boolean): PrIntentRecord {
    return {
      pr_id: s.prId,
      intent: s.intent,
      in_scope: s.inScope,
      out_of_scope: s.outOfScope,
      confidence: s.confidence,
      sources: s.sources,
      head_sha: s.headSha,
      provider: s.provider,
      model: s.model,
      tokens_in: s.tokensIn,
      tokens_out: s.tokensOut,
      cost_usd: s.costUsd,
      duration_ms: s.durationMs,
      derived_at: s.derivedAt ? s.derivedAt.toISOString() : null,
      stale,
    };
  }

  private async derive(
    workspaceId: string,
    prId: string,
    opts: { force: boolean; log: IntentLog; changedPaths?: string[] },
  ): Promise<Derived> {
    const t0 = Date.now();
    const inputs = await this.deps.repo.getInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    const { provider, model } = await this.deps.featureModel(workspaceId);
    const hash = this.hashFor(inputs, provider, model);

    const existing = await this.deps.repo.get(workspaceId, prId);
    if (!opts.force && existing && existing.sourceHash === hash) {
      opts.log.info(
        `Intent: cached (confidence=${existing.confidence}, derived ${ago(existing.derivedAt, this.now())})`,
        { confidence: existing.confidence, cached: true },
      );
      return { record: existing, cached: true, ms: Date.now() - t0 };
    }

    const record = await withTimeout(
      this.gatherAndDerive(workspaceId, prId, inputs, provider, model, hash, opts),
      INTENT_TOTAL_TIMEOUT_MS,
    );
    return { record, cached: false, ms: Date.now() - t0 };
  }

  private async gatherAndDerive(
    workspaceId: string,
    prId: string,
    inputs: IntentInputs,
    provider: Provider,
    model: string,
    hash: string,
    opts: { log: IntentLog; changedPaths?: string[] },
  ): Promise<StoredIntent> {
    const t0 = Date.now();
    const { log } = opts;
    const repoRef = { owner: inputs.owner, name: inputs.repoName };

    const title = inputs.title.slice(0, INTENT_TITLE_CHARS);
    const branch = inputs.branch.slice(0, INTENT_BRANCH_CHARS);
    const body = inputs.body ? inputs.body.slice(0, INTENT_BODY_CHARS) : null;
    const commits = inputs.commits.slice(0, INTENT_COMMIT_LIMIT).map((c) => commitSubject(c, INTENT_COMMIT_CHARS)).filter((c) => c.length > 0);
    const changedPaths = (opts.changedPaths ?? inputs.changedPaths).slice(0, INTENT_PATH_LIMIT);

    const sources: IntentSource[] = [
      { kind: 'title', ref: 'title', status: 'used', chars: title.length },
      { kind: 'branch', ref: 'branch', status: 'used', chars: branch.length },
      body && body.trim().length > 0
        ? { kind: 'body', ref: 'description', status: inputs.body!.length > body.length ? 'truncated' : 'used', chars: body.length }
        : { kind: 'body', ref: 'description', status: 'skipped', reason: 'empty' },
      commits.length > 0
        ? { kind: 'commits', ref: `${commits.length} commit(s)`, status: 'used', chars: commits.join('\n').length }
        : { kind: 'commits', ref: 'commits', status: 'skipped', reason: 'not_imported' },
      changedPaths.length > 0
        ? { kind: 'files', ref: `${changedPaths.length} path(s)`, status: 'used', chars: changedPaths.join('\n').length }
        : { kind: 'files', ref: 'files', status: 'skipped', reason: 'not_imported' },
    ];

    // ---- references -------------------------------------------------------
    let github: Awaited<ReturnType<IntentDeps['github']>> | undefined;
    let githubError: string | undefined;
    try {
      github = await this.deps.github();
    } catch (err) {
      githubError = err instanceof ConfigError ? 'no_github_token' : 'github_unavailable';
    }

    let closing: number[] = [];
    if (github) {
      try {
        closing = await withTimeout(github.getClosingIssues(repoRef, inputs.number), INTENT_SOURCE_TIMEOUT_MS);
      } catch {
        closing = []; // the regex pass below still finds `#N` references
      }
    }

    const refs = extractRefs({
      owner: inputs.owner,
      repo: inputs.repoName,
      prNumber: inputs.number,
      title,
      body,
      branch,
      commits,
      closingIssues: closing,
    });

    // Plans and specs the PR itself changes are read even when the body never names them.
    const docs: DocRef[] = [...refs.docs];
    for (const p of changedPaths) {
      if (docs.length >= INTENT_MAX_DOCS) break;
      if (!isPlanOrSpecPath(p)) continue;
      const check = normaliseRepoPath(p);
      if (check.ok && !docs.some((d) => d.repo.toLowerCase() === inputs.repoName.toLowerCase() && d.path === check.path)) {
        docs.push({ owner: inputs.owner, repo: inputs.repoName, path: check.path, ref: null, display: check.path });
      }
    }

    for (const s of refs.skipped) {
      sources.push({ kind: s.kind, ref: s.ref, status: 'skipped', reason: s.reason });
    }
    for (const key of refs.ticketKeys) {
      sources.push({ kind: 'ticket_key', ref: key, status: 'skipped', reason: 'no_ticket_provider' });
    }

    const refList = [
      ...refs.issues.map((i) => ({ kind: 'github_issue', ref: `#${i.number}` })),
      ...docs.map((d) => ({ kind: d.ref === null && d.repo.toLowerCase() === inputs.repoName.toLowerCase() ? 'repo_doc' : 'github_doc', ref: d.display })),
    ];
    if (refList.length > 0) log.tool(`Intent: reading ${refList.length} linked source(s)`, { refs: refList });

    const issueTexts: BudgetText[] = [];
    for (const issue of refs.issues) {
      const ref = issue.repo.toLowerCase() === inputs.repoName.toLowerCase() ? `#${issue.number}` : `${issue.owner}/${issue.repo}#${issue.number}`;
      if (!github) {
        sources.push({ kind: 'github_issue', ref, status: 'skipped', reason: githubError ?? 'no_github_token' });
        continue;
      }
      const fetched = await this.fetchIssue(github, issue);
      if (!fetched.ok) {
        sources.push({ kind: 'github_issue', ref, status: 'failed', reason: 'not_found_or_no_access' });
        continue;
      }
      issueTexts.push({ kind: 'github_issue', ref, text: fetched.text, truncated: fetched.truncated });
    }

    const docTexts: BudgetText[] = [];
    for (const doc of docs) {
      const sameRepo = doc.repo.toLowerCase() === inputs.repoName.toLowerCase();
      const kind = sameRepo && doc.ref === null ? 'repo_doc' : 'github_doc';
      const text = await this.fetchDoc(github, { owner: doc.owner, name: doc.repo }, doc, inputs.headSha, sameRepo);
      if (text === undefined) {
        sources.push({ kind, ref: doc.display, status: 'failed', reason: sameRepo ? 'not_found_at_head' : 'not_found_or_no_access' });
        continue;
      }
      docTexts.push({
        kind,
        ref: doc.display,
        text: text.slice(0, INTENT_DOC_CHARS),
        truncated: text.length > INTENT_DOC_CHARS,
      });
    }

    // ---- budget, confidence ------------------------------------------------
    const budget = applyBudget({
      fixedChars: title.length + branch.length + (body?.length ?? 0) + changedPaths.join('\n').length,
      docs: docTexts,
      issues: issueTexts,
      commits,
    });
    if (budget.commitsTruncated) {
      const c = sources.find((s) => s.kind === 'commits');
      if (c) {
        c.status = 'truncated';
        c.chars = budget.commits.join('\n').length;
      }
    }
    for (const t of [...budget.issues, ...budget.docs]) {
      sources.push({ kind: t.kind, ref: t.ref, status: t.truncated ? 'truncated' : 'used', chars: t.text.length });
      log.info(
        `Intent source ${t.kind} ${t.ref}: ${t.truncated ? 'truncated' : 'used'} (${t.text.length.toLocaleString('en-US')} chars)`,
        { kind: t.kind, ref: t.ref, status: t.truncated ? 'truncated' : 'used', chars: t.text.length },
      );
    }
    for (const s of sources.filter((x) => x.status === 'skipped' || x.status === 'failed')) {
      if (['title', 'branch', 'body', 'commits', 'files'].includes(s.kind)) continue;
      log.info(`Intent source ${s.kind} ${s.ref}: ${s.status} (${s.reason ?? ''})`, {
        kind: s.kind,
        ref: s.ref,
        status: s.status,
        reason: s.reason,
      });
    }

    const confidence = computeConfidence({
      bodyChars: (body ?? '').trim().length,
      hasLinkedDoc: hasLinkedDoc(sources),
    });

    // ---- the one LLM call ---------------------------------------------------
    log.tool(`Intent: deriving with ${provider}/${model}`, { provider, model });
    const llm = await this.deps.llm(provider);
    const derived = await deriveIntent({
      llm,
      model,
      timeoutMs: INTENT_LLM_TIMEOUT_MS,
      sessionId: `intent:${inputs.owner}/${inputs.repoName}#${inputs.number}`,
      input: {
        title,
        branch,
        body,
        commits: budget.commits,
        changedPaths,
        sources: [...budget.docs, ...budget.issues].map((t) => ({ kind: t.kind, ref: t.ref, text: t.text })),
      },
    });

    const durationMs = Date.now() - t0;
    const saved = await this.deps.repo.save(workspaceId, prId, {
      intent: derived.intent.intent,
      inScope: derived.intent.in_scope,
      outOfScope: derived.intent.out_of_scope,
      confidence,
      sources,
      sourceHash: hash,
      headSha: inputs.headSha,
      provider,
      model,
      tokensIn: derived.tokensIn,
      tokensOut: derived.tokensOut,
      costUsd: derived.costUsd,
      durationMs,
      derivedAt: this.now(),
    });
    if (!saved) throw new NotFoundError('Pull request not found');

    const basis = renderBasis(sources);
    log.result(
      `Intent derived: confidence=${confidence} (${basis.join(', ')}) · ${(derived.tokensIn + derived.tokensOut).toLocaleString('en-US')} tok · ${
        derived.costUsd === null ? 'cost n/a' : `$${derived.costUsd.toFixed(4)}`
      } · ${(durationMs / 1000).toFixed(1)}s`,
      {
        confidence,
        tokens_in: derived.tokensIn,
        tokens_out: derived.tokensOut,
        cost_usd: derived.costUsd,
        duration_ms: durationMs,
      },
    );
    return saved;
  }

  private async fetchIssue(
    github: Awaited<ReturnType<IntentDeps['github']>>,
    issue: IssueRef,
  ): Promise<{ ok: true; text: string; truncated: boolean } | { ok: false }> {
    try {
      const meta = await withTimeout(
        github.getIssue({ owner: issue.owner, name: issue.repo }, issue.number),
        INTENT_SOURCE_TIMEOUT_MS,
      );
      const title = meta.title.slice(0, INTENT_ISSUE_TITLE_CHARS);
      const rawBody = meta.body ?? '';
      const body = rawBody.slice(0, INTENT_ISSUE_BODY_CHARS);
      return { ok: true, text: `${title}\n\n${body}`.trim(), truncated: rawBody.length > body.length };
    } catch {
      return { ok: false };
    }
  }

  /** Same-repo docs: `git show <head>:<path>` first, GitHub contents at the head sha as fallback. */
  private async fetchDoc(
    github: Awaited<ReturnType<IntentDeps['github']>> | undefined,
    repo: { owner: string; name: string },
    doc: DocRef,
    headSha: string,
    sameRepo: boolean,
  ): Promise<string | undefined> {
    if (sameRepo) {
      try {
        return await withTimeout(this.deps.git.showFile(repo, headSha, doc.path), INTENT_SOURCE_TIMEOUT_MS);
      } catch {
        /* not cloned or not at that sha: fall back to GitHub */
      }
    }
    if (!github) return undefined;
    try {
      return await withTimeout(
        github.getFileContent(repo, doc.path, doc.ref ?? headSha),
        INTENT_SOURCE_TIMEOUT_MS,
      );
    } catch {
      return undefined;
    }
  }
}
