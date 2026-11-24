export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Above this many lines on either side we refuse to diff (LCS table is O(n·m)). */
export const MAX_DIFF_LINES = 3000;

/** Line diff via longest common subsequence. Returns `null` when too large. */
export function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;

  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]!, oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      out.push({ kind: "add", text: b[j]!, newNo: j + 1 });
      j++;
    } else {
      out.push({ kind: "del", text: a[i]!, oldNo: i + 1 });
      i++;
    }
  }
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
