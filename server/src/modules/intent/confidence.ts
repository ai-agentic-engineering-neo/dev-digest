import type { IntentConfidence, IntentSource } from '@devdigest/shared';
import { MIN_SUBSTANTIVE_BODY_WORDS } from './constants.js';

/**
 * Confidence is computed HERE, in code, deterministically — never reported by
 * the model. An author cannot claim "high" by writing a convincing sentence
 * into the PR body; only what the collector actually found counts.
 */

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const HEADING_LINE_RE = /^\s{0,3}#{1,6}\s/;
const EMPTY_CHECKLIST_RE = /^\s*[-*]\s*\[[ xX]?\]\s*$/;
const ONLY_LINK_OR_REF_RE = /^\s*(?:\[[^\]]*\]\([^)]*\)|https?:\/\/\S+|#\d+)\s*$/;

/** Boilerplate-strip + word-count gate on a body already capped to `MAX_BODY_CHARS`. */
export function isSubstantiveBody(body: string): boolean {
  const withoutComments = body.replace(HTML_COMMENT_RE, '');
  const words = withoutComments
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return false;
      if (HEADING_LINE_RE.test(line)) return false;
      if (EMPTY_CHECKLIST_RE.test(line)) return false;
      if (ONLY_LINK_OR_REF_RE.test(trimmed)) return false;
      return true;
    })
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= MIN_SUBSTANTIVE_BODY_WORDS;
}

export function computeConfidence(input: {
  bodySubstantive: boolean;
  sources: IntentSource[];
}): IntentConfidence {
  const docUsedOrTruncated = input.sources.some(
    (s) => s.kind === 'linked_doc' && (s.status === 'used' || s.status === 'truncated'),
  );
  const issueUsed = input.sources.some((s) => s.kind === 'linked_issue' && s.status === 'used');

  if (docUsedOrTruncated || (issueUsed && input.bodySubstantive)) return 'high';
  if (input.bodySubstantive || issueUsed) return 'medium';
  return 'low';
}
