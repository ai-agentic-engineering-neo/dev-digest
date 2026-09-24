/**
 * Domain glue for one derivation (server/specs/05-intent-layer.md): the
 * substantive-body check, clamping the model's own output, capping
 * confidence, rendering the per-source untrusted prompt block, and the
 * cache-key input (hashed by the application layer — sha256 is I/O-free but
 * still not "pure" enough to belong here; see application/intent-service.ts).
 */
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { IntentConfidence, IntentDerivedFrom, IntentSourceKind, IntentSourceStatus } from '@devdigest/shared';
import { INTENT_TEXT_MAX_CHARS, PROMPT_VERSION, SCOPE_ITEM_MAX_CHARS, SCOPE_MAX_ITEMS, SUBSTANTIVE_BODY_MIN_CHARS } from './constants.js';

// ---- substantive-body check -------------------------------------------------

/** Strip HTML comments (PR template instructions) and bare heading lines. */
export function stripBodyBoilerplate(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s{0,3}#{1,6}\s+\S.*$/.test(line))
    .join('\n')
    .trim();
}

/** `derived_from='explicit'` when the body carries real content on its own. */
export function isSubstantiveBody(body: string | null | undefined): boolean {
  if (!body) return false;
  return stripBodyBoilerplate(body).length >= SUBSTANTIVE_BODY_MIN_CHARS;
}

// ---- clamps (defense in depth on the model's own output) -------------------

export function truncateText(text: string, max: number): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= max) return { text: trimmed, truncated: false };
  return { text: `${trimmed.slice(0, max - 1)}…`, truncated: true };
}

export function clampIntentText(text: string): string {
  return truncateText(text, INTENT_TEXT_MAX_CHARS).text;
}

export function clampScopeList(items: readonly string[]): string[] {
  return items
    .slice(0, SCOPE_MAX_ITEMS)
    .map((s) => truncateText(s, SCOPE_ITEM_MAX_CHARS).text)
    .filter((s) => s.length > 0);
}

// ---- confidence --------------------------------------------------------------

/**
 * Confidence is set by CODE, never asked of the model (server/specs/
 * 05-intent-layer.md, "Confidence set by code"): `inferred` is always `low`;
 * `explicit` starts at `high` and is capped to `medium` when a referenced
 * ticket/doc failed or was skipped (degraded evidence, still real material).
 */
export function computeConfidence(derivedFrom: IntentDerivedFrom, degraded: boolean): IntentConfidence {
  if (derivedFrom === 'inferred') return 'low';
  return degraded ? 'medium' : 'high';
}

// ---- sources -------------------------------------------------------------

export interface CollectedSource {
  kind: IntentSourceKind;
  ref: string;
  status: IntentSourceStatus;
  detail?: string | null;
  /** Text to wrap into the prompt; absent for `skipped`/`failed` sources. */
  content?: string;
}

/** True when any ticket/doc source in `sources` was skipped or failed — degrades `explicit` confidence to `medium`. */
export function hasDegradedTicketOrDoc(sources: readonly CollectedSource[]): boolean {
  return sources.some(
    (s) => (s.kind === 'ticket' || s.kind === 'doc') && (s.status === 'skipped' || s.status === 'failed'),
  );
}

/**
 * True when at least one ticket/doc source was actually LOADED (`used` or
 * `truncated` — real content reached the prompt), not merely referenced in
 * text. Drives `derived_from` (server/specs/05-intent-layer.md,
 * "Confidence set by code"): a ticket/doc link that was only found in text
 * but then failed or was skipped does NOT make the intent `explicit`.
 */
export function hasLoadedTicketOrDoc(sources: readonly CollectedSource[]): boolean {
  return sources.some(
    (s) => (s.kind === 'ticket' || s.kind === 'doc') && (s.status === 'used' || s.status === 'truncated'),
  );
}

function sourceHeading(s: CollectedSource): string {
  switch (s.kind) {
    case 'title':
      return '### PR title';
    case 'body':
      return '### PR description';
    case 'ticket':
      return `### Linked ticket #${s.ref}`;
    case 'doc':
      return `### Linked doc: ${s.ref}`;
    case 'commits':
      return '### Commit messages';
    case 'branch':
      return '### Branch name';
    case 'diff':
      return '### Changed files';
    default:
      return `### ${s.kind}`;
  }
}

/** wrapUntrusted label: stable, filesystem/identifier-safe. */
function sourceLabel(s: CollectedSource): string {
  return `intent-${s.kind}-${s.ref}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

/**
 * The classification prompt's material: one heading + `wrapUntrusted` block
 * per source that has content (skipped/failed sources contribute nothing —
 * they only show up in `Intent.sources[]` for the UI/trace).
 */
export function renderSourcesBlock(sources: readonly CollectedSource[]): string {
  return sources
    .filter((s): s is CollectedSource & { content: string } => !!s.content && s.content.trim().length > 0)
    .map((s) => `${sourceHeading(s)}\n${wrapUntrusted(sourceLabel(s), s.content)}`)
    .join('\n\n');
}

// ---- cache key -------------------------------------------------------------

/**
 * Plain object hashed by the application layer into `pr_intent.input_hash`
 * (sha256 of its canonical JSON). Ticket/doc BODIES are deliberately NOT part
 * of the key — an edited ticket needs a manual refresh (the response then
 * reports `stale: true`); their PATHS/numbers are, so a newly linked ticket
 * or doc does invalidate the cache.
 */
export interface CacheKeyInput {
  prompt_version: number;
  provider: string;
  model: string;
  title: string;
  body: string;
  branch: string;
  head_sha: string;
  ticket_refs: number[];
  doc_paths: string[];
}

export function buildCacheKeyInput(params: {
  provider: string;
  model: string;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  ticketRefs: readonly number[];
  docPaths: readonly string[];
}): CacheKeyInput {
  return {
    prompt_version: PROMPT_VERSION,
    provider: params.provider,
    model: params.model,
    title: params.title,
    body: params.body ?? '',
    branch: params.branch,
    head_sha: params.headSha,
    ticket_refs: [...params.ticketRefs].sort((a, b) => a - b),
    doc_paths: [...params.docPaths].sort(),
  };
}

/** Deterministic key ordering so the same logical input always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
