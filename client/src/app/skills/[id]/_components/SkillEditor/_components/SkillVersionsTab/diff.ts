export type DiffLineType = "same" | "add" | "del";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface DiffGap {
  type: "gap";
  count: number;
}

/** Above this many LCS cells (after trimming the shared prefix/suffix) we skip the diff. */
const MAX_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Line-based diff (unified order: removals before additions within a changed
 * block). Returns null when the changed region is too large to diff cheaply.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) return null;

  // dp[i][j] = LCS length of midA[i:] and midB[j:]
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        midA[i] === midB[j]
          ? dp[(i + 1) * w + j + 1]! + 1
          : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  const push = (type: DiffLineType, text: string) => {
    out.push({
      type,
      text,
      oldNo: type === "add" ? null : oldNo,
      newNo: type === "del" ? null : newNo,
    });
    if (type !== "add") oldNo++;
    if (type !== "del") newNo++;
  };

  for (let k = 0; k < start; k++) push("same", a[k]!);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      push("same", midA[i]!);
      i++;
      j++;
    } else if (j >= m || (i < n && dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!)) {
      push("del", midA[i]!);
      i++;
    } else {
      push("add", midB[j]!);
      j++;
    }
  }
  for (let k = endA; k < a.length; k++) push("same", a[k]!);
  return out;
}

export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { added, removed };
}

/**
 * Collapse long runs of unchanged lines, keeping `context` lines around every
 * change. A run that would collapse to a single line is kept as-is.
 */
export function withContext(lines: DiffLine[], context = 3): Array<DiffLine | DiffGap> {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });

  const out: Array<DiffLine | DiffGap> = [];
  let idx = 0;
  while (idx < lines.length) {
    if (keep[idx]) {
      out.push(lines[idx]!);
      idx++;
      continue;
    }
    let end = idx;
    while (end < lines.length && !keep[end]) end++;
    if (end - idx === 1) out.push(lines[idx]!);
    else out.push({ type: "gap", count: end - idx });
    idx = end;
  }
  return out;
}
