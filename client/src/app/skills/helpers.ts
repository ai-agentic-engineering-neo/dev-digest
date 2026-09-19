/* Pure helpers shared across the Skills Lab route. */
import type { SkillSummary } from "@devdigest/shared";
import { SKILL_SLUG_PATTERN } from "./constants";

/** D3 slug rule: `^[a-z0-9][a-z0-9-]{1,63}$`. */
export function isValidSkillName(name: string): boolean {
  return SKILL_SLUG_PATTERN.test(name);
}

export function filterSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

/** `null` denominator (§7.2) renders as an em dash, never `0%`. */
export function formatRatio(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type DiffOp = "equal" | "add" | "remove";
export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Client-side LCS line diff (Versions tab) — no dependency, per spec §8.
 * Classic longest-common-subsequence backtrack over the two line arrays.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = lcs[i];
      const nextRow = lcs[i + 1];
      if (row === undefined || nextRow === undefined) continue;
      row[j] = a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ op: "equal", text: a[i] ?? "" });
      i++;
      j++;
    } else {
      const removeFirst = (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0);
      if (removeFirst) {
        result.push({ op: "remove", text: a[i] ?? "" });
        i++;
      } else {
        result.push({ op: "add", text: b[j] ?? "" });
        j++;
      }
    }
  }
  while (i < n) {
    result.push({ op: "remove", text: a[i] ?? "" });
    i++;
  }
  while (j < m) {
    result.push({ op: "add", text: b[j] ?? "" });
    j++;
  }
  return result;
}
