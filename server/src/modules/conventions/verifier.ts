/**
 * Evidence verification — the step that decides which proposals become rows.
 *
 * A model is far more reliable about "this project prefers X" than about which
 * line proves it. So every citation is checked against the file it names, and a
 * candidate whose evidence does not survive is DROPPED rather than stored with
 * a broken link: a rule you cannot click through to is indistinguishable from
 * one that was invented.
 *
 * Pure: every function takes text and returns data. No fs, no DB, no clock.
 */
import {
  EVIDENCE_SEARCH_PADDING,
  MAX_EVIDENCE_SPAN,
  MAX_SNIPPET_LINES,
  MIN_RELOCATE_CHARS,
} from './constants.js';
import type { ConventionCategory, ConventionEvidence } from '@devdigest/shared';

export type DiscardReason =
  | 'missing_file'
  | 'bad_lines'
  | 'snippet_mismatch'
  | 'duplicate'
  | 'rejected_before';

export interface ProposedCandidate {
  category: ConventionCategory;
  rule: string;
  rationale?: string | null;
  evidence: ConventionEvidence[];
  confidence: number;
}

export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  confidence: number;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  /** Read back from the FILE, never copied from the model's answer. */
  evidenceSnippet: string;
}

export type DiscardCounts = Record<DiscardReason, number>;

export function emptyDiscardCounts(): DiscardCounts {
  return {
    missing_file: 0,
    bad_lines: 0,
    snippet_mismatch: 0,
    duplicate: 0,
    rejected_before: 0,
  };
}

/**
 * Compare rules by meaning, not by spelling: the same convention proposed by
 * two scans differs in punctuation and backticks more often than in substance.
 */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`"'*_]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Compare code by tokens, so indentation and trailing punctuation do not matter. */
export function normalizeCode(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[;,]\s*$/g, '')
    .trim();
}

/**
 * Drop the `  42 | ` gutter the sampler prints before every line.
 *
 * The model reads numbered samples and sometimes quotes the numbers along with
 * the code; the quote is still real, but it no longer matches the file.
 */
export function stripLineNumbers(snippet: string): string {
  const lines = snippet.split('\n');
  const numbered = lines.filter((l) => /^\s*\d+\s\|/.test(l)).length;
  // Only when MOST lines carry the gutter: a lone `1 | 2` in real code stays.
  if (numbered === 0 || numbered < Math.ceil(lines.filter((l) => l.trim()).length / 2)) {
    return snippet;
  }
  return lines.map((l) => l.replace(/^\s*\d+\s\|\s?/, '')).join('\n');
}

/** Lines a quote occupies, ignoring the blank ones a model pads it with. */
function snippetLineCount(snippet: string): number {
  return snippet.replace(/^\s*\n|\n\s*$/g, '').split('\n').length;
}

/**
 * Find a quote anywhere in a file, sliding a window of the quote's own height.
 * Returns the first window that contains it, or null.
 */
function relocate(fileLines: string[], needle: string, height: number): { start: number; end: number } | null {
  if (needle.length < MIN_RELOCATE_CHARS) return null;
  for (let start = 1; start + height - 1 <= fileLines.length; start += 1) {
    const end = start + height - 1;
    if (normalizeCode(fileLines.slice(start - 1, end).join('\n')).includes(needle)) {
      return { start, end };
    }
  }
  return null;
}

/**
 * Locate a snippet inside a file and return the lines it really occupies.
 *
 * Tried in order: the claimed range with a little slack, then the whole file.
 * The second pass is a self-heal — a model that quotes real code but counts
 * lines badly has produced good evidence with a bad address, and repairing the
 * address is better than throwing the evidence away. It only runs for a quote
 * long enough not to match by accident (MIN_RELOCATE_CHARS).
 */
export function locateSnippet(
  fileLines: string[],
  snippet: string,
  claimStart: number,
  claimEnd: number,
): { start: number; end: number } | null {
  const needle = normalizeCode(snippet);
  if (needle === '') return null;

  const windowStart = Math.max(1, claimStart - EVIDENCE_SEARCH_PADDING);
  const windowEnd = Math.min(fileLines.length, claimEnd + EVIDENCE_SEARCH_PADDING);
  if (
    windowEnd >= windowStart &&
    normalizeCode(fileLines.slice(windowStart - 1, windowEnd).join('\n')).includes(needle)
  ) {
    return { start: claimStart, end: Math.min(claimEnd, fileLines.length) };
  }

  return relocate(fileLines, needle, Math.max(1, snippetLineCount(snippet)));
}

/** A claimed range the verifier can check as given. */
function isUsableRange(start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 1 &&
    end >= start &&
    end - start + 1 <= MAX_EVIDENCE_SPAN
  );
}

/**
 * Verify one citation against the clone.
 *
 * `files` is the exact set the model was shown; a path outside it cannot have
 * been read, so citing one is a hallucination rather than a near miss.
 *
 * A bad RANGE is not fatal on its own. The first real scan lost 3 of its 10
 * proposals to `bad_lines` — the model cited a whole function (lines 1-120)
 * around a short, real quote. What decides is the quote: if it is short enough
 * to be a citation and it is in the file, the range is rebuilt around it.
 */
export function verifyEvidence(
  evidence: ConventionEvidence,
  files: Map<string, string>,
): { ok: true; value: Omit<VerifiedCandidate, 'category' | 'rule' | 'rationale' | 'confidence'> } | { ok: false; reason: DiscardReason } {
  const text = files.get(evidence.path);
  if (text === undefined) return { ok: false, reason: 'missing_file' };

  const lines = text.split('\n');
  const snippet = stripLineNumbers(evidence.snippet);
  const rangeOk = isUsableRange(evidence.line_start, evidence.line_end);
  if (snippetLineCount(snippet) > MAX_SNIPPET_LINES) {
    return { ok: false, reason: 'bad_lines' };
  }

  const located = rangeOk
    ? locateSnippet(lines, snippet, evidence.line_start, evidence.line_end)
    : relocate(lines, normalizeCode(snippet), Math.max(1, snippetLineCount(snippet)));

  if (!located) return { ok: false, reason: rangeOk ? 'snippet_mismatch' : 'bad_lines' };

  return {
    ok: true,
    value: {
      evidencePath: evidence.path,
      evidenceLineStart: located.start,
      evidenceLineEnd: located.end,
      evidenceSnippet: lines.slice(located.start - 1, located.end).join('\n'),
    },
  };
}

export interface VerifyOptions {
  /** Rule texts the user already accepted — proposing them again is a duplicate. */
  knownRules?: string[];
  /** Rule texts the user rejected — never resurrect these. */
  rejectedRules?: string[];
}

/**
 * Verify a whole model answer. Returns the candidates that earned a row plus a
 * tally of why the rest did not — the tally is shown in the UI, because hiding
 * it would misrepresent how well the model did.
 */
export function verifyCandidates(
  proposed: ProposedCandidate[],
  files: Map<string, string>,
  opts: VerifyOptions = {},
): { kept: VerifiedCandidate[]; discarded: DiscardCounts } {
  const discarded = emptyDiscardCounts();
  const kept: VerifiedCandidate[] = [];

  const seen = new Set((opts.knownRules ?? []).map(normalizeRule));
  const rejected = new Set((opts.rejectedRules ?? []).map(normalizeRule));

  for (const candidate of proposed) {
    const rule = candidate.rule.trim();
    if (rule === '') continue;
    const key = normalizeRule(rule);

    if (rejected.has(key)) {
      discarded.rejected_before += 1;
      continue;
    }
    if (seen.has(key)) {
      discarded.duplicate += 1;
      continue;
    }

    // First citation that survives wins; the rest are redundant for storage.
    let verified: VerifiedCandidate | null = null;
    let lastReason: DiscardReason = 'missing_file';
    for (const evidence of candidate.evidence) {
      const result = verifyEvidence(evidence, files);
      if (result.ok) {
        verified = {
          category: candidate.category,
          rule,
          rationale: candidate.rationale?.trim() || null,
          confidence: Math.min(1, Math.max(0, candidate.confidence)),
          ...result.value,
        };
        break;
      }
      lastReason = result.reason;
    }

    if (!verified) {
      discarded[candidate.evidence.length === 0 ? 'missing_file' : lastReason] += 1;
      continue;
    }

    seen.add(key);
    kept.push(verified);
  }

  return { kept, discarded };
}
