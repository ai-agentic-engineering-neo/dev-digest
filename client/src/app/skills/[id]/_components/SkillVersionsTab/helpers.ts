/**
 * Line diff between two skill bodies.
 *
 * The app already has a DiffViewer, but it PARSES a unified patch produced by
 * git. Skill versions are two plain strings with no patch between them, so the
 * diff has to be computed here.
 */
import { MAX_DIFF_CELLS } from "./constants";

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
  /** 1-based line number in the older body; absent on added lines. */
  oldNo?: number;
  /** 1-based line number in the newer body; absent on removed lines. */
  newNo?: number;
}

/** Split a body into lines, treating an empty body as having none at all. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Diff `before` against `after`, line by line.
 *
 * Common head and tail are stripped before the expensive step, so the usual
 * edit — a few lines changed in the middle of a rubric — costs a linear scan
 * plus a tiny table, not a table over the whole document.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const out: DiffLine[] = [];
  for (let i = 0; i < head; i++) {
    out.push({ kind: "ctx", text: a[i]!, oldNo: i + 1, newNo: i + 1 });
  }

  const middle =
    midA.length * midB.length > MAX_DIFF_CELLS
      ? [
          ...midA.map((text) => ({ kind: "del" as const, text })),
          ...midB.map((text) => ({ kind: "add" as const, text })),
        ]
      : lcsDiff(midA, midB);

  let oldNo = head + 1;
  let newNo = head + 1;
  for (const line of middle) {
    if (line.kind === "del") out.push({ kind: "del", text: line.text, oldNo: oldNo++ });
    else if (line.kind === "add") out.push({ kind: "add", text: line.text, newNo: newNo++ });
    else out.push({ kind: "ctx", text: line.text, oldNo: oldNo++, newNo: newNo++ });
  }

  for (let i = 0; i < tail; i++) {
    out.push({ kind: "ctx", text: a[a.length - tail + i]!, oldNo: oldNo++, newNo: newNo++ });
  }

  return out;
}

/** Longest-common-subsequence diff over the part that actually differs. */
function lcsDiff(a: string[], b: string[]): { kind: "add" | "del" | "ctx"; text: string }[] {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..]. Filled backwards so the
  // walk below can move forwards and emit lines in document order.
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: { kind: "add" | "del" | "ctx"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** Added / removed line counts, for the diff header. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
