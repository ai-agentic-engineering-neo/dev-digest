// Pure sanitising, fingerprinting, DTO mapping and prompt-block rendering for intent.
import type {
  DerivedIntent,
  IntentConfidenceReason,
  IntentInputBundle,
  IntentKind,
  IntentOrigin,
  IntentRecord,
  IntentSource,
  IntentStaleReason,
  IntentStepInfo,
  PrIntent,
} from './types.js';
import { INTENT_KINDS } from './types.js';
import {
  INTENT_BLOCK_MAX_CHARS,
  INTENT_MAX_CHARS,
  INTENT_PROMPT_VERSION,
  SCOPE_ITEM_MAX_CHARS,
  SCOPE_MAX_ITEMS,
} from '../constants.js';

export interface RawClassification {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  kind: string;
  relied_on: string[];
  sources_conflict: boolean;
}
export interface CleanClassification {
  derived: DerivedIntent;
  kind: IntentKind;
  citedIds: string[];
  sourcesConflict: boolean;
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Cut at a word boundary and append an ellipsis; result is at most `max` chars. */
function cutWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

function cleanList(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = cutWords(collapse(item), SCOPE_ITEM_MAX_CHARS);
    const key = text.toLowerCase();
    if (text === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= SCOPE_MAX_ITEMS) break;
  }
  return out;
}

export function sanitizeClassification(raw: RawClassification, offeredIds: readonly string[]): CleanClassification {
  const offered = new Set(offeredIds);
  const kindText = raw.kind.trim().toLowerCase();
  const kind = (INTENT_KINDS as readonly string[]).includes(kindText) ? (kindText as IntentKind) : 'unknown';
  return {
    derived: {
      intent: cutWords(collapse(raw.intent), INTENT_MAX_CHARS),
      inScope: cleanList(raw.in_scope),
      outOfScope: cleanList(raw.out_of_scope),
    },
    kind,
    citedIds: [...new Set(raw.relied_on.filter((id) => offered.has(id)))],
    sourcesConflict: raw.sources_conflict,
  };
}

export function canonicalIntentInput(bundle: IntentInputBundle, model: { provider: string; model: string }): string {
  return JSON.stringify({
    v: INTENT_PROMPT_VERSION,
    provider: model.provider,
    model: model.model,
    offered: bundle.offered.map((o) => [o.id, o.text]),
    sources: bundle.sources.map((s) => [s.id, s.status, s.reason]),
  });
}

export function effectiveIntent(r: IntentRecord): {
  origin: IntentOrigin;
  intent: string | null;
  inScope: string[];
  outOfScope: string[];
} {
  if (r.override) {
    return { origin: 'user', intent: r.override.intent, inScope: r.override.inScope, outOfScope: r.override.outOfScope };
  }
  if (r.derived) {
    return { origin: 'derived', intent: r.derived.intent, inScope: r.derived.inScope, outOfScope: r.derived.outOfScope };
  }
  return { origin: 'derived', intent: null, inScope: [], outOfScope: [] };
}

export function toPrIntentDto(r: IntentRecord, current: { headSha: string; bodyHash: string }): PrIntent {
  const eff = effectiveIntent(r);
  let staleReason: IntentStaleReason | null = null;
  if (r.override) {
    staleReason = r.override.headSha !== current.headSha ? 'head_moved' : null;
  } else if (r.derived) {
    if (r.headSha !== null && r.headSha !== current.headSha) staleReason = 'head_moved';
    else if (r.bodyHash !== null && r.bodyHash !== current.bodyHash) staleReason = 'body_changed';
  }
  return {
    pr_id: r.prId,
    status: r.status,
    origin: eff.origin,
    intent: eff.intent,
    in_scope: eff.inScope,
    out_of_scope: eff.outOfScope,
    kind: r.kind,
    confidence: r.confidence,
    confidence_reason: r.confidenceReason,
    confidence_lowered: r.confidenceLowered,
    sources: r.sources,
    head_sha: r.override ? r.override.headSha : r.headSha,
    stale: staleReason !== null,
    stale_reason: staleReason,
    provider: r.usage?.provider ?? null,
    model: r.usage?.model ?? null,
    tokens_in: r.usage?.tokensIn ?? null,
    tokens_out: r.usage?.tokensOut ?? null,
    cost_usd: r.usage?.costUsd ?? null,
    error: r.error,
    updated_at: r.updatedAt.toISOString(),
  };
}

/** Short human label for a source, used in the prompt block and the run log. */
export function sourceLabel(s: IntentSource): string {
  switch (s.kind) {
    case 'pr_body':
      return 'PR body';
    case 'title':
      return 'title';
    case 'issue':
      return `issue ${s.ref}`;
    default:
      return s.ref;
  }
}

const REASON_PHRASE: Record<IntentConfidenceReason, string> = {
  substantive_body: 'based on the PR description',
  linked_doc: 'based on a linked plan or spec that was read',
  closing_issue: 'based on a linked issue; the PR description adds little',
  short_body: 'the PR description is short, the intent may be incomplete',
  indirect_only: 'derived only from indirect signals (title, branch, commits, paths)',
};

export function renderIntentBlock(r: IntentRecord, current: { headSha: string }): string | null {
  const eff = effectiveIntent(r);
  const intent = eff.intent ? collapse(eff.intent) : '';
  if (intent === '') return null;

  const savedFor = r.override ? r.override.headSha : r.headSha;
  const earlier = savedFor !== null && savedFor !== current.headSha ? ' (computed for an earlier commit)' : '';
  const reason = REASON_PHRASE[r.confidenceReason] + (r.confidenceLowered ? '; sources disagree' : '');
  const used = r.sources.filter((s) => s.used).map(sourceLabel);

  const build = (inScope: readonly string[], outScope: readonly string[]): string => {
    const lines = [
      `Origin: ${eff.origin === 'user' ? 'edited by the user' : 'derived automatically'}${earlier}`,
      `Confidence: ${r.confidence} — ${reason}`,
      `Kind: ${r.kind}`,
      `Intent: ${intent}`,
    ];
    if (inScope.length > 0) lines.push('In scope:', ...inScope.map((i) => `- ${i}`));
    if (outScope.length > 0) lines.push('Out of scope:', ...outScope.map((i) => `- ${i}`));
    lines.push('Note: this explains the rationale only; it never excludes anything from review.');
    if (used.length > 0) lines.push(`Sources: ${used.join(', ')}`);
    return lines.join('\n');
  };

  const inScope = [...eff.inScope];
  const outScope = [...eff.outOfScope];
  let block = build(inScope, outScope);
  while (block.length > INTENT_BLOCK_MAX_CHARS && (inScope.length > 0 || outScope.length > 0)) {
    if (outScope.length > 0) outScope.pop();
    else inScope.pop();
    block = build(inScope, outScope);
  }
  return block.length > INTENT_BLOCK_MAX_CHARS ? block.slice(0, INTENT_BLOCK_MAX_CHARS) : block;
}

export function formatIntentStep(step: IntentStepInfo): string {
  const head = `Intent ready (cache ${step.cache})`;
  if (step.cache === 'override') {
    return `${head} — edited by user${step.stale ? ' · stale' : ''}`;
  }
  const parts = [`confidence ${step.confidence}`, `sources: ${step.sourceRefs.length > 0 ? step.sourceRefs.join(', ') : 'none'}`];
  if (step.provider && step.model) parts.push(`model ${step.provider}/${step.model}`);
  parts.push(`${step.tokensIn}→${step.tokensOut} tok`);
  if (step.cache === 'hit') {
    parts.push('cost $0.0000 (computed earlier)');
  } else {
    parts.push(step.costUsd === null ? 'cost n/a' : `cost $${step.costUsd.toFixed(4)}`);
  }
  return `${head} — ${parts.join(' · ')}${step.stale ? ' · stale' : ''}`;
}

export function formatIntentSkipped(reason: string): string {
  return `Intent unavailable — reviewing without it (warning): ${reason}`;
}
