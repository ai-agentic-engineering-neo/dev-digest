import type { ConventionCategory } from '@devdigest/shared';
import {
  LINE_TOLERANCE,
  MAX_CANDIDATES,
  MAX_FILE_LINES,
  MIN_QUOTE_CHARS,
  SNIPPET_AFTER,
  SNIPPET_BEFORE,
} from './constants.js';

/**
 * L02 — conventions rules that hold regardless of storage, transport or model:
 *  - the model only proposes; a candidate survives only if its quoted line of
 *    code really is in a file of the repo (at or near the cited line);
 *  - the evidence snippet is cut from the real file, never taken from the model;
 *  - a path the model cites must stay inside the clone.
 * Pure: no I/O, no zod, no framework.
 */

export class ConventionDomainError extends Error {
  constructor(
    readonly code: 'extract_in_progress' | 'repo_not_indexed',
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** What the model returns per candidate — untrusted until verified. */
export interface RawCandidate {
  category: ConventionCategory;
  rule: string;
  evidence_path: string;
  line: number;
  quote: string;
  confidence: number;
}

export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

/** Collapse whitespace so indentation / wrapping differences don't fail a real quote. */
export function normalizeCode(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * A repo-relative path the model may cite: no absolute paths, no `..`, no
 * backslashes or NUL. Returns the cleaned path, or null when unsafe.
 */
export function safeRepoPath(p: string): string | null {
  const cleaned = p.trim().replace(/^\.\/+/, '');
  if (!cleaned || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) return null;
  if (cleaned.includes('\\') || cleaned.includes('\0')) return null;
  if (cleaned.split('/').some((seg) => seg === '..' || seg === '')) return null;
  return cleaned;
}

/** First `MAX_FILE_LINES` lines, each prefixed with its 1-based number (prompt input). */
export function numberLines(content: string, maxLines = MAX_FILE_LINES): string {
  return content
    .split('\n')
    .slice(0, maxLines)
    .map((line, i) => `${i + 1}| ${line}`)
    .join('\n');
}

/**
 * 0-based index of the line holding `quote`, searching the cited line first
 * and then outwards up to ±LINE_TOLERANCE (nearest wins). -1 when absent.
 */
export function locateQuote(lines: string[], citedLine: number, quote: string): number {
  const needle = normalizeCode(quote);
  if (needle.length < MIN_QUOTE_CHARS) return -1;
  const cited = citedLine - 1;
  for (let d = 0; d <= LINE_TOLERANCE; d++) {
    for (const i of d === 0 ? [cited] : [cited - d, cited + d]) {
      const line = lines[i];
      if (line !== undefined && normalizeCode(line).includes(needle)) return i;
    }
  }
  return -1;
}

function cutSnippet(lines: string[], at: number): string {
  const from = Math.max(0, at - SNIPPET_BEFORE);
  const to = Math.min(lines.length, at + SNIPPET_AFTER + 1);
  const window = lines.slice(from, to);
  // drop blank edge lines so the card shows code, not whitespace
  while (window.length > 1 && window[0]!.trim() === '') window.shift();
  while (window.length > 1 && window[window.length - 1]!.trim() === '') window.pop();
  return window.join('\n');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * The evidence gate. `files` maps repo-relative path → content for every file
 * the candidates cite that exists in the clone (missing files are absent).
 * Drops a candidate whose path is unsafe / missing, or whose quote is not on
 * (or near) the cited line; re-anchors `line` to where the quote really is;
 * dedupes by rule (highest confidence wins); keeps the top MAX_CANDIDATES.
 */
export function verifyEvidence(
  candidates: RawCandidate[],
  files: ReadonlyMap<string, string>,
): VerifiedCandidate[] {
  const byRule = new Map<string, VerifiedCandidate>();
  for (const c of candidates) {
    const rule = c.rule.trim();
    const path = safeRepoPath(c.evidence_path);
    if (!rule || !path) continue;
    const content = files.get(path);
    if (!content) continue;
    const lines = content.split('\n');
    const at = locateQuote(lines, Math.trunc(c.line), c.quote);
    if (at < 0) continue;

    const verified: VerifiedCandidate = {
      category: c.category,
      rule,
      evidencePath: path,
      evidenceLine: at + 1,
      evidenceSnippet: cutSnippet(lines, at),
      confidence: clamp01(c.confidence),
    };
    const key = normalizeCode(rule).toLowerCase();
    const prev = byRule.get(key);
    if (!prev || verified.confidence > prev.confidence) byRule.set(key, verified);
  }
  return [...byRule.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}

/** A `running` scan older than `staleMs` is treated as failed (process died mid-run). */
export function isStaleRunning(
  scan: { status: string; startedAt: Date },
  now: Date,
  staleMs: number,
): boolean {
  return scan.status === 'running' && now.getTime() - scan.startedAt.getTime() > staleMs;
}
