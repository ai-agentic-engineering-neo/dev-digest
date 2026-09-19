import type { Line } from "@/components/diff-viewer";

/**
 * Line-level LCS from `a` to `b`. Same kinds as the PR DiffViewer (`del` left
 * `a`, `add` arrived in `b`, `ctx` unchanged) so CodeLine can render it.
 */
export function diffLines(a: string, b: string): Line[] {
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
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ kind: "ctx", text: aLines[i]!, oldNo, newNo });
      i++;
      j++;
      oldNo++;
      newNo++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "del", text: aLines[i++]!, oldNo: oldNo++ });
    } else {
      out.push({ kind: "add", text: bLines[j++]!, newNo: newNo++ });
    }
  }
  while (i < n) out.push({ kind: "del", text: aLines[i++]!, oldNo: oldNo++ });
  while (j < m) out.push({ kind: "add", text: bLines[j++]!, newNo: newNo++ });
  return out;
}
