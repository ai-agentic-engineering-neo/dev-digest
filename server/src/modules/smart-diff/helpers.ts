/**
 * Pure functions only — no I/O, no DB, no container (onion-architecture §4).
 * The smart-diff classifier, the "latest review per agent" rule, and the
 * response builder. See `server/specs/L03-smart-diff.md` § Contract for the
 * classifier table this file implements.
 */
import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_ROLE_ORDER } from '@devdigest/shared';
import {
  BOILERPLATE_BASENAMES,
  BOILERPLATE_BASENAME_SUFFIXES,
  BOILERPLATE_SEGMENTS,
  CONFIG_BASENAME_RE,
  DOCS_BASENAMES,
  DOCS_BASENAME_PREFIXES,
  DOCS_BASENAME_SUFFIX,
  DOCS_SEGMENT,
  GENERATED_BASENAME_RE,
  LARGE_PR_LINES,
  TEST_BASENAME_SUFFIXES,
  TEST_SEGMENTS,
  WIRING_BASENAMES,
  WIRING_BASENAME_PREFIXES,
  WIRING_SEGMENTS,
} from './constants.js';

/** A PR file, as far as the classifier and the size check need it. */
export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

/** A review, as far as the "latest per agent" rule and finding_lines need it. */
export interface SmartDiffSourceReview {
  id: string;
  agentId: string | null;
  createdAt: Date;
  findings: { file: string; startLine: number; dismissedAt: Date | null }[];
}

function splitPath(path: string): { base: string; dirs: string[] } {
  const segments = path.split('/');
  const base = segments[segments.length - 1] ?? path;
  const dirs = segments.slice(0, -1);
  return { base, dirs };
}

function hasSegment(dirs: string[], segments: readonly string[]): boolean {
  return dirs.some((d) => (segments as readonly string[]).includes(d));
}

function isBoilerplate(base: string, dirs: string[]): boolean {
  if (BOILERPLATE_BASENAME_SUFFIXES.some((s) => base.endsWith(s))) return true;
  if ((BOILERPLATE_BASENAMES as readonly string[]).includes(base)) return true;
  if (hasSegment(dirs, BOILERPLATE_SEGMENTS)) return true;
  if (GENERATED_BASENAME_RE.test(base)) return true;
  return false;
}

function isTest(base: string, dirs: string[]): boolean {
  if (TEST_BASENAME_SUFFIXES.some((s) => base.endsWith(s))) return true;
  if (hasSegment(dirs, TEST_SEGMENTS)) return true;
  return false;
}

function isWiring(base: string, dirs: string[]): boolean {
  if ((WIRING_BASENAMES as readonly string[]).includes(base)) return true;
  if (CONFIG_BASENAME_RE.test(base)) return true;
  if (base.startsWith('tsconfig') && base.endsWith('.json')) return true;
  if (WIRING_BASENAME_PREFIXES.some((p) => base.startsWith(p))) return true;
  if (base.startsWith('docker-compose') && base.endsWith('.yml')) return true;
  if (hasSegment(dirs, WIRING_SEGMENTS)) return true;
  return false;
}

function isDocs(base: string, dirs: string[]): boolean {
  if (base.endsWith(DOCS_BASENAME_SUFFIX)) return true;
  if (dirs.includes(DOCS_SEGMENT)) return true;
  if (DOCS_BASENAME_PREFIXES.some((p) => base.startsWith(p))) return true;
  if ((DOCS_BASENAMES as readonly string[]).includes(base)) return true;
  return false;
}

/**
 * Classify a PR file path into one of the 5 smart-diff roles. First match
 * wins, checked in the order boilerplate → tests → wiring → docs, else
 * `core`. Case-sensitive; a "segment" is an exact match against a path
 * component, never a substring or the basename.
 */
export function classifyPath(path: string): SmartDiffRole {
  const { base, dirs } = splitPath(path);
  if (isBoilerplate(base, dirs)) return 'boilerplate';
  if (isTest(base, dirs)) return 'tests';
  if (isWiring(base, dirs)) return 'wiring';
  if (isDocs(base, dirs)) return 'docs';
  return 'core';
}

/**
 * Keep only the latest review per agent: reviews with `agentId === null` are
 * ALL one group (not one group per row). Within a group, the greatest
 * `createdAt` wins; ties break on the greater `id` (code-unit order).
 */
export function latestReviewPerAgent<R extends { id: string; agentId: string | null; createdAt: Date }>(
  reviews: R[],
): R[] {
  const groups = new Map<string | null, R>();
  for (const review of reviews) {
    const key = review.agentId;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, review);
      continue;
    }
    if (
      review.createdAt.getTime() > current.createdAt.getTime() ||
      (review.createdAt.getTime() === current.createdAt.getTime() && review.id > current.id)
    ) {
      groups.set(key, review);
    }
  }
  return [...groups.values()];
}

/** Sorted, de-duplicated non-dismissed finding start_lines, per file path. */
function findingLinesByFile(reviews: SmartDiffSourceReview[]): Map<string, number[]> {
  const kept = latestReviewPerAgent(reviews);
  const byFile = new Map<string, Set<number>>();
  for (const review of kept) {
    for (const finding of review.findings) {
      if (finding.dismissedAt !== null) continue;
      const set = byFile.get(finding.file) ?? new Set<number>();
      set.add(finding.startLine);
      byFile.set(finding.file, set);
    }
  }
  const result = new Map<string, number[]>();
  for (const [file, lines] of byFile) {
    result.set(file, [...lines].sort((a, b) => a - b));
  }
  return result;
}

/**
 * Build the deterministic `SmartDiff` response: non-empty role groups in
 * `SMART_DIFF_ROLE_ORDER`, files within a group sorted by path (code-unit
 * order), each file's `finding_lines` from non-dismissed findings of the
 * latest review per agent, `pseudocode_summary` always `null`,
 * `proposed_splits` always `[]`.
 */
export function buildSmartDiff(
  files: SmartDiffSourceFile[],
  reviews: SmartDiffSourceReview[],
): SmartDiff {
  const findingLines = findingLinesByFile(reviews);

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyPath(file.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines.get(file.path) ?? [],
    });
    byRole.set(role, list);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const list = byRole.get(role);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    groups.push({ role, files: list });
  }

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: {
      too_big: totalLines >= LARGE_PR_LINES,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
