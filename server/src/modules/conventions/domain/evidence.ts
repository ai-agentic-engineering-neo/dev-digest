/**
 * The evidence gate (spec: Pipeline §3) — pure checks over file lines. The
 * application ring reads the files (confined to the clone) and calls these.
 */
import type { ConventionDropReason, ConventionEvidence } from '@devdigest/shared';
import { EVIDENCE_MAX_LINES } from './constants.js';

/** Evidence as the model cited it (unverified). */
export interface ClaimedEvidence {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
}

export type EvidenceCheck =
  | { ok: true; evidence: ConventionEvidence }
  | { ok: false; reason: ConventionDropReason };

/**
 * A repo-relative POSIX path, or null when it could escape the clone: absolute
 * paths, drive letters, `..` / empty segments and NUL bytes are rejected.
 */
export function safeRelativePath(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!p || p.includes('\0') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return p;
}

/** Whitespace-insensitive form of one line. */
function norm(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** The model sees numbered lines (`  12| code`) and sometimes copies the prefix. */
const LINE_NO_PREFIX = /^\s*\d+\|\s?/;
/** A snippet line this long may match a longer file line as a substring. */
const PARTIAL_MIN_CHARS = 12;

function snippetLines(snippet: string): string[] {
  return snippet
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => norm(l.replace(LINE_NO_PREFIX, '')))
    .filter((l) => l.length > 0);
}

function lineMatches(fileLine: string, snip: string): boolean {
  return fileLine === snip || (snip.length >= PARTIAL_MIN_CHARS && fileLine.includes(snip));
}

/** Common leading whitespace removed; trailing whitespace trimmed. */
function dedent(lines: string[]): string {
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut).trimEnd()).join('\n');
}

/**
 * Verify one cited evidence item against the file's lines. The snippet is looked
 * for first at the cited range, then anywhere in the file (nearest to the cited
 * line wins) — a found snippet is RELOCATED to its real lines. The stored snippet
 * is always the real file text, never the model's.
 */
export function verifyEvidence(fileLines: readonly string[], claimed: ClaimedEvidence): EvidenceCheck {
  const wanted = snippetLines(claimed.snippet);
  if (wanted.length === 0) return { ok: false, reason: 'invalid' };

  // Indices of non-blank lines, so blank lines inside the snippet or file don't matter.
  const nonBlank: number[] = [];
  const normed = fileLines.map(norm);
  normed.forEach((l, i) => {
    if (l) nonBlank.push(i);
  });

  const starts: number[] = [];
  for (let k = 0; k + wanted.length <= nonBlank.length; k++) {
    if (wanted.every((w, j) => lineMatches(normed[nonBlank[k + j]!]!, w))) starts.push(k);
  }
  if (starts.length === 0) {
    return { ok: false, reason: claimed.start_line > fileLines.length ? 'line_out_of_range' : 'snippet_mismatch' };
  }

  const cited = claimed.start_line - 1;
  const best = starts.reduce((a, b) =>
    Math.abs(nonBlank[b]! - cited) < Math.abs(nonBlank[a]! - cited) ? b : a,
  );
  const first = nonBlank[best]!;
  const last = nonBlank[best + wanted.length - 1]!;
  const end = Math.min(last, first + EVIDENCE_MAX_LINES - 1);
  return {
    ok: true,
    evidence: {
      path: claimed.path,
      start_line: first + 1,
      end_line: end + 1,
      snippet: dedent(fileLines.slice(first, end + 1) as string[]),
    },
  };
}

/** Key for de-duplicating rules: case, punctuation and spacing do not count. */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
