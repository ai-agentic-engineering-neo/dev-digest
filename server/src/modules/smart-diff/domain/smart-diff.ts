/**
 * Pure read-model builder (server/specs/06-smart-diff.md, "Build"). No I/O,
 * no PR lookup — the application service resolves the PR and its data first.
 */
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

/** The subset of a finding buildSmartDiff needs — start_line of ALL findings, dismissed too. */
export interface SmartDiffFindingInput {
  file: string;
  start_line: number;
}

/**
 * Groups files by role (fixed order, each sorted by path) and attaches every
 * file's `finding_lines` (unique ascending `start_line`s of the findings
 * passed in). A finding whose `file` isn't one of `files` is silently
 * ignored — it belongs to a path outside this PR's current file set.
 */
export function buildSmartDiff(files: readonly SmartDiffFileInput[], findings: readonly SmartDiffFindingInput[]): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.start_line);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(SMART_DIFF_ROLE_ORDER.map((role) => [role, []]));
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sortedFiles) {
    const role = classifyFile(file.path);
    const finding_lines = [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b);
    byRole.get(role)!.push({ path: file.path, additions: file.additions, deletions: file.deletions, finding_lines });
  }

  const groups = SMART_DIFF_ROLE_ORDER.map((role) => ({ role, files: byRole.get(role) ?? [] }));
  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  return { groups, split_suggestion: { too_big: false, total_lines, proposed_splits: [] } };
}
