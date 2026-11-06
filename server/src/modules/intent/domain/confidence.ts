// Deterministic body quality, confidence and staleness. The model never decides confidence.
import type {
  BodyQuality,
  IntentConfidence,
  IntentConfidenceReason,
  IntentSource,
  IntentStaleReason,
} from './types.js';
import { SUBSTANTIVE_BODY_MIN_CHARS } from '../constants.js';

const HEADING_RE = /^\s*#{1,6}(?:\s|$)/;
const CHECKLIST_RE = /^\s*[-*+]\s*\[[ xX]?\]/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BARE_CLOSING_RE =
  /^\s*(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:#\d{1,9}|[\w.-]+\/[\w.-]+#\d{1,9}|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d{1,9})\s*$/i;

/** Drops comments, headings, checklist lines, rules and bare `Closes #N` lines, then measures what is left. */
export function assessBody(body: string | null): { quality: BodyQuality; templateOnly: boolean } {
  const raw = (body ?? '').trim();
  if (raw === '') return { quality: 'empty', templateOnly: false };
  const kept = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .filter((l) => l.trim() !== '' && !HEADING_RE.test(l) && !CHECKLIST_RE.test(l) && !RULE_RE.test(l) && !BARE_CLOSING_RE.test(l))
    .map((l) => l.trim())
    .join('\n');
  const len = kept.length;
  if (len === 0) return { quality: 'empty', templateOnly: true };
  return { quality: len >= SUBSTANTIVE_BODY_MIN_CHARS ? 'substantive' : 'short', templateOnly: false };
}

export function deriveConfidence(i: {
  body: BodyQuality;
  sources: readonly IntentSource[];
  sourcesConflict: boolean;
}): { confidence: IntentConfidence; reason: IntentConfidenceReason; lowered: boolean } {
  let confidence: IntentConfidence;
  let reason: IntentConfidenceReason;
  if (i.body === 'substantive') {
    confidence = 'high';
    reason = 'substantive_body';
  } else if (i.sources.some((s) => (s.kind === 'plan' || s.kind === 'spec' || s.kind === 'doc') && s.status === 'read')) {
    confidence = 'high';
    reason = 'linked_doc';
  } else if (i.sources.some((s) => s.kind === 'issue' && s.weight === 'strong' && s.status === 'read')) {
    confidence = 'medium';
    reason = 'closing_issue';
  } else if (i.body === 'short') {
    confidence = 'medium';
    reason = 'short_body';
  } else {
    confidence = 'low';
    reason = 'indirect_only';
  }
  if (i.sourcesConflict && confidence !== 'low') {
    return { confidence: confidence === 'high' ? 'medium' : 'low', reason, lowered: true };
  }
  return { confidence, reason, lowered: false };
}

export function staleness(
  stored: { headSha: string | null; bodyHash: string | null },
  current: { headSha: string; bodyHash: string },
): IntentStaleReason | null {
  if (stored.headSha !== null && stored.headSha !== current.headSha) return 'head_moved';
  if (stored.bodyHash !== null && stored.bodyHash !== current.bodyHash) return 'body_changed';
  return null;
}
