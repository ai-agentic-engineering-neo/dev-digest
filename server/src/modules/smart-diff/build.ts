import type { SmartDiff } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_GROUP_ORDER, SMART_DIFF_LARGE_PR_LINES } from './constants.js';
import type { FindingAnchor, SmartDiffFileInput } from './domain.js';

/** Deterministic grouping of PR files by role; always returns every role, in order. */
export function buildSmartDiff(
  files: readonly SmartDiffFileInput[],
  findings: readonly FindingAnchor[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByFile.set(f.file, set);
  }

  const entries = files.map((file) => ({
    role: classifyFile(file.path),
    file: {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      pseudocode_summary: null,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    },
  }));

  const groups = SMART_DIFF_GROUP_ORDER.map((role) => ({
    role,
    files: entries.filter((e) => e.role === role).map((e) => e.file),
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: {
      too_big: totalLines > SMART_DIFF_LARGE_PR_LINES,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
