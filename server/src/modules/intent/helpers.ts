import { createHash } from 'node:crypto';
import type { IntentDerivation, IntentSource, PrIntentRecord } from '@devdigest/shared';
import {
  INTENT_DERIVATION_VERSION,
  MAX_INTENT_CHARS,
  MAX_RISK_AREAS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SCOPE_ITEMS,
} from './constants.js';
import type { StoredIntent } from './types.js';

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Drives the GET endpoint's `stale` flag, independent of the cache key. */
export function textHash(title: string, body: string): string {
  return sha256(`${title}\n${body}`);
}

export interface SourceHashInput {
  systemTemplate: string;
  provider: string;
  model: string;
  title: string;
  body: string;
  docs: { path: string; content: string }[];
  issues: { number: number; title: string; body: string }[];
  branch: string;
  commitSubjects: string[];
  files: { path: string; additions: number; deletions: number }[];
  labels: string[];
  unresolved: IntentSource[];
}

/**
 * Content-addressed cache key: everything the derivation actually used, hashed
 * in a fixed key order so the same inputs always produce the same key. Does
 * NOT include the raw head_sha — a commit that touches unrelated files must
 * still hit the cache; `head_sha` is tracked separately for `stale`.
 */
export function sourceHash(input: SourceHashInput): string {
  const canonical = {
    version: INTENT_DERIVATION_VERSION,
    systemTemplateHash: sha256(input.systemTemplate),
    provider: input.provider,
    model: input.model,
    title: input.title,
    body: input.body,
    docs: input.docs.map((d) => ({ path: d.path, hash: sha256(d.content) })),
    issues: input.issues.map((i) => ({ number: i.number, hash: sha256(`${i.title}\n${i.body}`) })),
    branch: input.branch,
    commitSubjects: input.commitSubjects,
    files: input.files.map((f) => ({ path: f.path, add: f.additions, del: f.deletions })),
    labels: [...input.labels].sort(),
    unresolved: input.unresolved.map((u) => ({ kind: u.kind, ref: u.ref })),
  };
  return sha256(JSON.stringify(canonical));
}

/**
 * A doc the PR itself adds is not yet reachable at `head_sha` through the
 * usual read (the fetch races the index), so we can recover it from the PR's
 * own patch — but only for a brand-new file: an edit's patch is a diff, not
 * the full content, and reading it as one would silently show a wrong file.
 */
export function contentFromAddedFilePatch(patch: string | null | undefined): string | null {
  if (!patch) return null;
  const lines = patch.split('\n');
  const first = lines[0] ?? '';
  if (!/^@@ -0,0 \+1,\d+ @@/.test(first)) return null;
  return lines
    .slice(1)
    .filter((l) => l.startsWith('+'))
    .map((l) => l.slice(1))
    .join('\n');
}

/** Trim, drop empties, and enforce the output caps — the schema declares no
 * bounds on purpose (`IntentDerivation` § 4.0), so this is where they land. */
export function normalizeDerivation(data: IntentDerivation): IntentDerivation {
  const clipItem = (s: string) => s.trim().slice(0, MAX_SCOPE_ITEM_CHARS);
  const cleanList = (items: string[], max: number) =>
    items.map(clipItem).filter((s) => s.length > 0).slice(0, max);
  return {
    intent: data.intent.trim().slice(0, MAX_INTENT_CHARS),
    in_scope: cleanList(data.in_scope, MAX_SCOPE_ITEMS),
    out_of_scope: cleanList(data.out_of_scope, MAX_SCOPE_ITEMS),
    risk_areas: cleanList(data.risk_areas, MAX_RISK_AREAS),
  };
}

/** Domain → wire. JSON on the wire is snake_case. */
export function toPrIntentRecord(stored: StoredIntent, stale: boolean): PrIntentRecord {
  return {
    pr_id: stored.prId,
    intent: stored.intent,
    in_scope: stored.inScope,
    out_of_scope: stored.outOfScope,
    risk_areas: stored.riskAreas,
    confidence: stored.confidence,
    sources: stored.sources,
    provider: stored.provider,
    model: stored.model,
    head_sha: stored.headSha,
    derived_at: stored.derivedAt,
    tokens_in: stored.tokensIn,
    tokens_out: stored.tokensOut,
    cost_usd: stored.costUsd,
    stale,
  };
}
