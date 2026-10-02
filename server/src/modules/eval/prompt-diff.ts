import type { EvalCompare } from '@devdigest/shared';

/**
 * specs/12-eval-pipeline.md AC-34 — pure, dependency-free line diff between
 * two system prompts. No new package: a classic LCS-based line diff is
 * small enough to own, and this is the only place in the codebase that
 * needs one.
 */

export type PromptDiffLine = EvalCompare['prompt_diff'][number];

/** LCS-based line diff. O(m*n) time/space — fine for system-prompt-sized
 *  inputs (a few hundred lines at most). */
export function diffLines(oldText: string, newText: string): PromptDiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const m = a.length;
  const n = b.length;

  // dp[i][j] = length of the LCS of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: PromptDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ kind: 'context', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      result.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < m) {
    result.push({ kind: 'removed', text: a[i]! });
    i++;
  }
  while (j < n) {
    result.push({ kind: 'added', text: b[j]! });
    j++;
  }
  return result;
}
