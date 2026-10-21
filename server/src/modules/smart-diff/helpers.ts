/** smart-diff: pure classification and grouping (ring 2). */
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { DEFAULT_ROLE, ROLE_ORDER, ROLE_RULES, SPLIT_THRESHOLD_LINES } from './constants.js';
import type { SmartDiffInputs } from './ports.js';

export function classifyPath(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').toLowerCase();
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((re) => re.test(p))) return rule.role;
  }
  return DEFAULT_ROLE;
}

export function buildSmartDiff(inputs: SmartDiffInputs): SmartDiff {
  const byPath = new Map<string, SmartDiffInputs['findings']>();
  for (const f of inputs.findings) {
    const list = byPath.get(f.file);
    if (list) list.push(f);
    else byPath.set(f.file, [f]);
  }

  const buckets = new Map<SmartDiffRole, { file: SmartDiffFile; open: number }[]>(
    ROLE_ORDER.map((r) => [r, []]),
  );
  for (const src of inputs.files) {
    const fs = byPath.get(src.path) ?? [];
    const open = fs.filter((f) => !f.dismissed);
    buckets.get(classifyPath(src.path))!.push({
      open: open.length,
      file: {
        path: src.path,
        pseudocode_summary: null,
        additions: src.additions,
        deletions: src.deletions,
        finding_lines: [...new Set(open.map((f) => f.startLine))].sort((a, b) => a - b),
        finding_ids: fs.map((f) => f.id),
      },
    });
  }

  const groups = ROLE_ORDER.map((role) => ({
    role,
    files: buckets
      .get(role)!
      .sort(
        (a, b) =>
          b.open - a.open ||
          b.file.additions + b.file.deletions - (a.file.additions + a.file.deletions) ||
          a.file.path.localeCompare(b.file.path),
      )
      .map((e) => e.file),
  }));

  const totalLines = inputs.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const tooBig = totalLines > SPLIT_THRESHOLD_LINES;
  return {
    has_review: inputs.hasReview,
    groups,
    split_suggestion: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: tooBig
        ? groups
            .filter((g) => g.role !== 'boilerplate' && g.files.length > 0)
            .map((g) => ({ name: g.role, files: g.files.map((f) => f.path) }))
        : [],
    },
  };
}
