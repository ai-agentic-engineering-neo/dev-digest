/**
 * Line-level LCS diff from `a` to `b`. `-` removed from a, `+` added in b,
 * two spaces for unchanged lines. No extra dependency.
 */
export function diffBodies(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const n = aLines.length;
  const m = bLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = aLines[i] === bLines[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push(`  ${aLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push(`- ${aLines[i++]}`);
    } else {
      out.push(`+ ${bLines[j++]}`);
    }
  }
  while (i < n) out.push(`- ${aLines[i++]}`);
  while (j < m) out.push(`+ ${bLines[j++]}`);
  return out.join("\n");
}
