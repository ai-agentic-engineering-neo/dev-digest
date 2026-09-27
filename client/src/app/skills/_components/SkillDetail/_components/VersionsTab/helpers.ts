/** Pure helpers for VersionsTab — the line diff behind the Diff button. */

export type DiffOp = "same" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Line diff between two skill bodies.
 *
 * A hand-rolled LCS rather than a dependency: the inputs are a page of markdown,
 * the algorithm is twenty lines, and a diffing library would be the first
 * runtime dependency this screen has needed.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "remove", text: a[i]! });
      i += 1;
    } else {
      out.push({ op: "add", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) out.push({ op: "remove", text: a[i++]! });
  while (j < b.length) out.push({ op: "add", text: b[j++]! });
  return out;
}

/** How many lines the diff adds and removes — the summary line above it. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.op === "add").length,
    removed: lines.filter((l) => l.op === "remove").length,
  };
}

/**
 * Drop long stretches of unchanged text, keeping `context` lines around each
 * change. Without this, a one-word edit renders the whole skill body twice.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, idx) => {
    if (line.op === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k += 1) {
      keep[k] = true;
    }
  });

  const out: DiffLine[] = [];
  let skipping = false;
  lines.forEach((line, idx) => {
    if (keep[idx]) {
      skipping = false;
      out.push(line);
    } else if (!skipping) {
      skipping = true;
      out.push({ op: "same", text: "…" });
    }
  });
  return out;
}
