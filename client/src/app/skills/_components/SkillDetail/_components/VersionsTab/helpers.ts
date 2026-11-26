/* Pure helpers for the skill Versions tab (no React, no i18n). */
import type { SkillVersion } from "@devdigest/shared";
import { NO_VALUE } from "@/lib/format";

export type DiffKind = "add" | "del" | "same";
export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/** Body → lines; the empty body has no lines (not one empty line). */
function splitLines(text: string): string[] {
  return text === "" ? [] : text.split(/\r?\n/);
}

/**
 * Line diff `a → b` via longest common subsequence. `del` = only in `a`,
 * `add` = only in `b`, `same` = in both. On a replaced run, deletions come
 * before additions. O(n·m) time and memory — fine for ≤ 20 000-char bodies.
 */
export function lineDiff(a: string, b: string): DiffLine[] {
  const from = splitLines(a);
  const to = splitLines(b);
  const n = from.length;
  const m = to.length;
  const width = m + 1;
  // table[i * width + j] = LCS length of from[i..] and to[j..]; row n / column m stay 0.
  const table = new Uint32Array((n + 1) * width);
  const lcs = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        from[i] === to[j] ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1));
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const left = from[i];
    const right = to[j];
    if (left !== undefined && left === right) {
      out.push({ kind: "same", text: left });
      i++;
      j++;
    } else if (left !== undefined && (right === undefined || lcs(i + 1, j) >= lcs(i, j + 1))) {
      out.push({ kind: "del", text: left });
      i++;
    } else if (right !== undefined) {
      out.push({ kind: "add", text: right });
      j++;
    }
  }
  return out;
}

/** Versions newest first (does not mutate the input). */
export function sortNewestFirst(versions: readonly SkillVersion[]): SkillVersion[] {
  return [...versions].sort((x, y) => y.version - x.version);
}

/** ISO timestamp → `YYYY-MM-DD` (UTC); "—" when unparsable. */
export function formatDay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return NO_VALUE;
  return new Date(ms).toISOString().slice(0, 10);
}
