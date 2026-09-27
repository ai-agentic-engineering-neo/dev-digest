import type { Container } from '../../platform/container.js';
import {
  IntentClassification,
  type IntentSourceKind,
  type IntentSourceRef,
  type PrIntent,
  type UnifiedDiff,
} from '@devdigest/shared';
import type * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { PullRow, ReviewRepository } from './repository.js';
import {
  COMMIT_MESSAGE_CHARS,
  DESCRIPTION_CHARS,
  INTENT_FEATURE_ID,
  INTENT_SCHEMA_NAME,
  ISSUE_BODY_CHARS,
  ISSUE_FETCH_TIMEOUT_MS,
  MAX_COMMITS,
  MAX_PATHS,
  MAX_PLAN_DOCS,
  PLAN_DOC_CHARS,
  PLAN_READ_TIMEOUT_MS,
} from './intent-constants.js';
import {
  addedLinesFromPatch,
  autoPlanFiles,
  buildClassifierMessages,
  extractRefs,
  finalizeIntent,
  intentInputHash,
  isDocumented,
  truncate,
} from './intent-helpers.js';
import { prIntentRowToDto } from './helpers.js';

/** `log(level, message, data?)` — callers map it onto the run log or pino. Never pass PR text into it. */
export type IntentLog = (level: 'info' | 'warn', msg: string, data?: unknown) => void;

export interface EnsureIntentOptions {
  /** Regenerate even when the stored intent still matches head + inputs. */
  force?: boolean;
  log?: IntentLog;
  /** Wall-clock budget for the whole derivation; on expiry → undefined. */
  timeoutMs?: number;
}

/** Per-derivation state shared between `ensureIntent` and `derive`. */
interface DeriveState {
  /** Set on timeout: the LLM port has no abort signal, so `derive` checks this before persisting. */
  cancelled: boolean;
  /** pr_id + head_sha + input_hash, known once the inputs are hashed. */
  failureKey?: string;
}

/** In-process negative cache: recent failures skip the LLM call (bounded, TTL). */
const FAILURE_TTL_MS = 5 * 60_000;
const FAILURE_CACHE_MAX = 200;
const recentFailures = new Map<string, number>();

function hasRecentFailure(key: string): boolean {
  const at = recentFailures.get(key);
  if (at === undefined) return false;
  if (Date.now() - at > FAILURE_TTL_MS) {
    recentFailures.delete(key);
    return false;
  }
  return true;
}

function rememberFailure(key: string | undefined): void {
  if (!key) return;
  recentFailures.delete(key);
  recentFailures.set(key, Date.now());
  while (recentFailures.size > FAILURE_CACHE_MAX) {
    const oldest = recentFailures.keys().next().value;
    if (oldest === undefined) break;
    recentFailures.delete(oldest);
  }
}

class SkippedError extends Error {}

class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Derive (or reuse) the intent of a PR. Same shape as `loadDiff`: takes the
 * container + repository and does its own I/O, so the executor and the routes
 * share one code path.
 *
 * NEVER throws: intent is an optional enrichment, so any failure returns
 * undefined (and is logged without PR text) and the review proceeds without it.
 */
export async function ensureIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
  diff: UnifiedDiff,
  opts: EnsureIntentOptions = {},
): Promise<PrIntent | undefined> {
  const log: IntentLog = opts.log ?? (() => undefined);
  const started = Date.now();
  const state: DeriveState = { cancelled: false };
  try {
    const work = derive(container, repo, workspaceId, pull, repoRow, diff, opts.force ?? false, log, state);
    const result = opts.timeoutMs ? await withTimeout(work, opts.timeoutMs, 'Intent derivation') : await work;
    if (result) log('info', `Intent ready in ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    state.cancelled = true;
    // Only remember failures of the derivation itself (not "skipped: cached").
    if (!(err instanceof SkippedError)) rememberFailure(state.failureKey);
    // Error messages only — never bodies, issue text or plan content.
    if (err instanceof SkippedError) {
      log('info', 'Intent skipped — recent failure cached');
      return undefined;
    }
    log('warn', `Intent derivation failed: ${(err as Error).message}`);
    return undefined;
  }
}

async function derive(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
  diff: UnifiedDiff,
  force: boolean,
  log: IntentLog,
  state: DeriveState,
): Promise<PrIntent | undefined> {
  if (diff.files.length === 0) {
    log('info', 'Intent skipped: no changed files');
    return undefined;
  }
  const repoRef = { owner: repoRow.owner, name: repoRow.name };

  // ---- load inputs --------------------------------------------------------
  const commitRows = (await repo.getPrCommits(pull.id))
    .slice()
    .sort((a, b) => (a.committedAt?.getTime() ?? 0) - (b.committedAt?.getTime() ?? 0))
    .slice(0, MAX_COMMITS);
  const commits = commitRows.map((c) => truncate(c.message, COMMIT_MESSAGE_CHARS).text);
  const paths = diff.files.map((f) => f.path).slice(0, MAX_PATHS);

  const refs = extractRefs([pull.body ?? '', ...commits], repoRef);
  const linkedPlans = refs.planPaths;
  const autoPlans = autoPlanFiles(paths).filter((p) => !linkedPlans.includes(p));
  const planCandidates = [...linkedPlans, ...autoPlans].slice(0, MAX_PLAN_DOCS);

  const choice = await resolveFeatureModel(container, workspaceId, INTENT_FEATURE_ID);
  const inputHash = intentInputHash({
    title: pull.title,
    body: pull.body ?? null,
    branch: pull.branch,
    commits,
    paths,
    issues: refs.issues.map((i) => i.number),
    planPaths: planCandidates,
    provider: choice.provider,
    model: choice.model,
  });

  state.failureKey = `${pull.id}:${pull.headSha}:${inputHash}`;

  // ---- cache --------------------------------------------------------------
  const cached = await repo.getIntent(pull.id);
  if (!force && cached && cached.headSha === pull.headSha && cached.inputHash === inputHash) {
    log('info', 'Intent cache hit — reusing stored intent', { model: cached.model });
    return prIntentRowToDto(cached);
  }

  if (!force && hasRecentFailure(state.failureKey)) throw new SkippedError();

  // ---- resolve issues (same-repo only; failures degrade to `unresolved`) ---
  const sources: IntentSourceRef[] = [];
  const issues: { ref: string; title: string; body: string }[] = [];
  if (refs.issues.length > 0) {
    let gh: Awaited<ReturnType<Container['github']>> | undefined;
    try {
      gh = await container.github();
    } catch {
      gh = undefined; // no token configured — treat every issue as unresolved
    }
    const settled = await Promise.all(
      refs.issues.map(async (i) => {
        const ref = `#${i.number}`;
        try {
          if (!gh) throw new Error('no github client');
          return { ref, meta: await withTimeout(gh.getIssue(repoRef, i.number), ISSUE_FETCH_TIMEOUT_MS, 'Issue fetch') };
        } catch {
          return { ref, meta: undefined };
        }
      }),
    );
    for (const { ref, meta } of settled) {
      if (!meta) {
        sources.push({ kind: 'linked_issue', ref, title: null, status: 'unresolved', truncated: false });
        continue;
      }
      const body = truncate(meta.body ?? '', ISSUE_BODY_CHARS);
      issues.push({ ref, title: meta.title, body: body.text });
      sources.push({ kind: 'linked_issue', ref, title: meta.title, status: 'used', truncated: body.truncated });
    }
  }

  // ---- resolve plan / spec docs -------------------------------------------
  const plans: { path: string; content: string }[] = [];
  let requiredPlanUnreadable = false;
  if (planCandidates.length > 0) {
    const prFiles = await repo.getPrFiles(pull.id);
    for (const path of planCandidates) {
      const changed = paths.includes(path);
      const content = await readPlan(container, repoRef, pull, path, changed, prFiles);
      if (content === undefined) {
        sources.push({ kind: 'plan_spec', ref: path, title: null, status: 'unreadable', truncated: false });
        if (linkedPlans.includes(path)) requiredPlanUnreadable = true;
        continue;
      }
      const cut = truncate(content, PLAN_DOC_CHARS);
      plans.push({ path, content: cut.text });
      sources.push({ kind: 'plan_spec', ref: path, title: null, status: 'used', truncated: cut.truncated });
    }
  }
  sources.push(...refs.unresolved.filter((u) => !sources.some((s) => s.ref === u.ref)), ...refs.external);

  // ---- documented vs fallback ---------------------------------------------
  const describedBody = isDocumented(pull.body);
  const documented = describedBody || issues.length > 0 || plans.length > 0;
  const available: IntentSourceKind[] = [];
  if (describedBody) {
    const d = truncate(pull.body ?? '', DESCRIPTION_CHARS);
    sources.unshift({ kind: 'description', ref: 'PR description', title: null, status: 'used', truncated: d.truncated });
    available.push('description');
  }
  if (issues.length > 0) available.push('linked_issue');
  if (plans.length > 0) available.push('plan_spec');
  if (commits.length > 0) {
    sources.push({ kind: 'commits', ref: `${commits.length} commit(s)`, title: null, status: 'used', truncated: false });
    available.push('commits');
  }
  sources.push({ kind: 'branch', ref: pull.branch, title: null, status: 'used', truncated: false });
  available.push('branch');
  sources.push({ kind: 'file_paths', ref: `${paths.length} file(s)`, title: null, status: 'used', truncated: false });
  available.push('file_paths');

  // ---- classify (one structured call, no tools) ---------------------------
  const messages = buildClassifierMessages({
    title: pull.title,
    branch: pull.branch,
    description: describedBody ? pull.body ?? null : null,
    documented,
    issues,
    plans,
    commits,
    paths,
    diffRaw: diff.raw,
  });
  const llm = await container.llm(choice.provider);
  const res = await llm.completeStructured({
    model: choice.model,
    schema: IntentClassification,
    schemaName: INTENT_SCHEMA_NAME,
    temperature: 0,
    messages,
  });

  // The LLM port takes no abort signal, so a timed-out call still completes (and
  // is billed); make sure its late result is never persisted.
  if (state.cancelled) return undefined;
  const final = finalizeIntent(res.data, { diff, documented, requiredPlanUnreadable, availableSources: available });
  await repo.upsertIntent(pull.id, {
    head_sha: pull.headSha,
    input_hash: inputHash,
    ...final,
    sources_used: sources,
    provider: choice.provider,
    model: choice.model,
    cost_usd: res.costUsd,
    tokens_in: res.tokensIn,
    tokens_out: res.tokensOut,
  });
  log('info', 'Intent derived', {
    model: `${choice.provider}/${choice.model}`,
    cost_usd: res.costUsd,
    confidence: final.confidence_level,
    mode: documented ? 'documented' : 'fallback',
    sources: sources.map((s) => `${s.kind}:${s.status}`),
  });

  const row = await repo.getIntent(pull.id);
  return row ? prIntentRowToDto(row) : undefined;
}

/**
 * Read one plan/spec through a chain: head commit -> base -> lines the PR added
 * (from the stored patch, only for files the PR changes). Undefined when nothing
 * is readable. An unchanged file is looked up at the head too (same as base).
 */
async function readPlan(
  container: Container,
  repoRef: { owner: string; name: string },
  pull: PullRow,
  path: string,
  changed: boolean,
  prFiles: { path: string; patch: string | null }[],
): Promise<string | undefined> {
  for (const ref of [pull.headSha, pull.base]) {
    try {
      return await withTimeout(container.git.readFileAt(repoRef, ref, path), PLAN_READ_TIMEOUT_MS, 'Plan read');
    } catch {
      /* try the next link of the chain */
    }
  }
  const patch = changed ? prFiles.find((f) => f.path === path)?.patch : undefined;
  const added = patch ? addedLinesFromPatch(patch) : '';
  return added.trim().length > 0 ? added : undefined;
}
