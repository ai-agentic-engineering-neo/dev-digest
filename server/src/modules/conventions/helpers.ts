import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

export interface EvidenceCandidate {
  evidence_path: string;
  evidence_start_line: number;
  evidence_end_line: number;
  evidence_snippet: string;
}

export interface DedupeRow {
  rule: string;
  evidencePath: string | null;
}

/** Reject empty, absolute, and `..` traversal paths. Model output is untrusted. */
export function isSafeRepoPath(path: string): boolean {
  const p = path.trim();
  if (!p) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return false;
  if (p.split(/[\\/]/).some((seg) => seg === '..')) return false;
  return true;
}

/**
 * True when `snippet` (trimmed) occurs in the 1-based inclusive line range.
 * Case-sensitive. Out-of-bounds ranges fail.
 */
export function snippetInRange(
  fileText: string,
  start: number,
  end: number,
  snippet: string,
): boolean {
  const needle = snippet.trim();
  if (!needle) return false;
  const lines = fileText.split('\n');
  if (start < 1 || end < start || end > lines.length) return false;
  return lines.slice(start - 1, end).join('\n').includes(needle);
}

/**
 * Keep a candidate only when the cited file exists (non-empty), the path is
 * inside the clone, and the snippet is in the cited line range.
 */
export function groundCandidate(
  fileText: string | null | undefined,
  candidate: EvidenceCandidate,
): boolean {
  if (!isSafeRepoPath(candidate.evidence_path)) return false;
  if (fileText == null || fileText.trim() === '') return false;
  return snippetInRange(
    fileText,
    candidate.evidence_start_line,
    candidate.evidence_end_line,
    candidate.evidence_snippet,
  );
}

export function pendingDedupeKey(rule: string, path: string): string {
  return `${rule.trim()}\0${path}`;
}

/** False when any existing row (any status) already has the same rule + path. */
export function shouldInsertPending(
  existingRows: DedupeRow[],
  candidate: { rule: string; evidence_path: string },
): boolean {
  const key = pendingDedupeKey(candidate.rule, candidate.evidence_path);
  return !existingRows.some(
    (row) => pendingDedupeKey(row.rule, row.evidencePath ?? '') === key,
  );
}

export interface AssembleRow {
  status: string;
  category: string | null;
  rule: string;
  evidencePath: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
}

/** Heading-safe slug from category (or rule). Empty / punctuation-only → `convention`. */
export function headingSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'convention';
}

function evidenceRange(row: AssembleRow): string {
  const path = row.evidencePath ?? '';
  if (row.evidenceStartLine == null) return path;
  if (row.evidenceEndLine == null || row.evidenceEndLine === row.evidenceStartLine) {
    return `${path}:${row.evidenceStartLine}`;
  }
  return `${path}:${row.evidenceStartLine}-${row.evidenceEndLine}`;
}

/**
 * Markdown skill body from accepted rows only. Rejected / pending in `rows`
 * are omitted — the compose route still refuses those ids separately.
 */
export function assembleSkillBody(name: string, repoLabel: string, rows: AssembleRow[]): string {
  const sections = rows
    .filter((row) => row.status === 'accepted')
    .map((row) => {
      const slug = headingSlug(row.category || row.rule);
      return `## ${slug}\n${row.rule}\nDetected in \`${evidenceRange(row)}\``;
    });
  return [
    `# ${name}`,
    '',
    `House conventions for '${repoLabel}'. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
    ...sections,
  ]
    .join('\n')
    .trimEnd()
    .concat('\n');
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  const status = row.status as ConventionStatus;
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status,
    category: row.category,
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    accepted: status === 'accepted',
  };
}
