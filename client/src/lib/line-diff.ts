/**
 * line-diff — a small LCS-based line diff for the Skills Versions tab's Diff
 * modal (before = an older version's body, after = the CURRENT version's
 * body). No npm dependency: bodies are short Markdown files, so the O(n*m)
 * DP table is cheap.
 */

export type LineDiffOpType = "equal" | "add" | "remove";

export interface LineDiffOp {
  type: LineDiffOpType;
  text: string;
}

/** Diff two texts line-by-line. Returns the edit script that turns `before`
   into `after`, expressed as a run of equal/remove/add lines in `after`'s
   order (a `remove` line still carries `before`'s text). */
export function lineDiff(before: string, after: string): LineDiffOp[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: LineDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      ops.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: a[i++]! });
  while (j < m) ops.push({ type: "add", text: b[j++]! });
  return ops;
}
