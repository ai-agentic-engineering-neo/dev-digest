import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_ANY_SEGMENTS,
  BOILERPLATE_ROOT_DIRS,
  CLASSIFY_ORDER,
  DOCS_BASENAME_PREFIXES,
  DOCS_EXTENSIONS,
  DOCS_ROOT_DIRS,
  LOCKFILE_BASENAMES,
  SMART_DIFF_ROLE_ORDER,
  TEST_ANY_SEGMENTS,
  TEST_BASENAME_RE,
  TEST_ROOT_DIRS,
  WIRING_BASENAMES,
  WIRING_BASENAME_RES,
  WIRING_ROOT_DIRS,
} from './constants.js';

/** Pure helpers for the Smart Diff (no IO, no drizzle). */

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface ReviewRowInput {
  id: string;
  kind: string;
  agentId: string | null;
}

export interface FindingLineInput {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

type Matcher = (path: string, segments: string[], base: string) => boolean;

const MATCHERS: Record<Exclude<SmartDiffRole, 'core'>, Matcher> = {
  boilerplate: (_p, segs, base) =>
    base.endsWith('.lock') ||
    LOCKFILE_BASENAMES.includes(base) ||
    BOILERPLATE_ROOT_DIRS.includes(segs[0] ?? '') && segs.length > 1 ||
    segs.slice(0, -1).some((s) => BOILERPLATE_ANY_SEGMENTS.includes(s)) ||
    base.endsWith('.snap') ||
    base.includes('.generated.') ||
    base.endsWith('.min.js'),
  tests: (_p, segs, base) =>
    TEST_BASENAME_RE.test(base) ||
    segs.slice(0, -1).some((s) => TEST_ANY_SEGMENTS.includes(s)) ||
    (TEST_ROOT_DIRS.includes(segs[0] ?? '') && segs.length > 1),
  wiring: (_p, segs, base) =>
    WIRING_BASENAMES.includes(base) ||
    base.includes('.config.') ||
    WIRING_BASENAME_RES.some((re) => re.test(base)) ||
    (WIRING_ROOT_DIRS.includes(segs[0] ?? '') && segs.length > 1),
  docs: (_p, segs, base) =>
    DOCS_EXTENSIONS.some((e) => base.endsWith(e)) ||
    (DOCS_ROOT_DIRS.includes(segs[0] ?? '') && segs.length > 1) ||
    DOCS_BASENAME_PREFIXES.some((p) => base.startsWith(p)),
};

/** Role of a repo-relative path. First match in CLASSIFY_ORDER wins; `core` is the fallback. */
export function classifyFile(path: string): SmartDiffRole {
  const segments = path.split('/');
  const base = segments[segments.length - 1] ?? path;
  for (const role of CLASSIFY_ORDER) {
    if (MATCHERS[role](path, segments, base)) return role;
  }
  return 'core';
}

/**
 * Newest review per agent (rows must be newest-first). Duplicates
 * `pickCountedReviews` in modules/pulls/helpers.ts and the client's
 * `latestFindingsPerAgent` on purpose: modules never import each other's helpers.
 */
export function pickLatestReviewPerAgent<T extends ReviewRowInput>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (r.kind !== 'review') continue;
    const key = r.agentId ?? 'none';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** path → sorted unique start lines of non-dismissed findings. */
export function findingLinesByPath(findings: FindingLineInput[]): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissedAt) continue;
    let s = sets.get(f.file);
    if (!s) sets.set(f.file, (s = new Set()));
    s.add(f.startLine);
  }
  const out = new Map<string, number[]>();
  for (const [k, s] of sets) out.set(k, [...s].sort((a, b) => a - b));
  return out;
}

export function buildSmartDiff(
  files: SmartDiffFileInput[],
  linesByPath: Map<string, number[]>,
): SmartDiff {
  const buckets = new Map<SmartDiffRole, SmartDiff['groups'][number]['files']>();
  let total = 0;
  // `pr_files` may hold duplicate rows after racing detail refreshes; count each path once.
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    total += f.additions + f.deletions;
    const role = classifyFile(f.path);
    const list = buckets.get(role) ?? [];
    list.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: linesByPath.get(f.path) ?? [],
      pseudocode_summary: null,
    });
    buckets.set(role, list);
  }
  const groups = SMART_DIFF_ROLE_ORDER.flatMap((role) => {
    const list = buckets.get(role);
    return list && list.length > 0 ? [{ role, files: list }] : [];
  });
  return {
    groups,
    split_suggestion: {
      total_lines: total,
      too_big: false,
      proposed_splits: [],
    },
  };
}
