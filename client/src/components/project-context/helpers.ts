/* Pure helpers for Project Context UI — effective-set math mirroring the
   server's run-time rules (own docs first, then inherited, dedup by first
   occurrence, budget applied in order without back-fill). */
import type { ContextDocument, InheritedContextPath } from "@devdigest/shared";

export interface PickerRow {
  path: string;
  doc: ContextDocument | null;
  /** Attached directly (own) — checkbox editable, reorderable. */
  own: boolean;
  /** Present only through a linked skill — checked, read-only. */
  inheritedFrom: string | null;
}

/** The agent's effective paths: own (ordered), then inherited not already present. */
export function effectivePaths(own: readonly string[], inherited: readonly InheritedContextPath[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...own, ...inherited.map((i) => i.path)]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Paths the run would skip under the budget: the first present doc that
 * overflows, and every present doc after it. Unknown (not found) paths cost 0.
 */
export function pathsSkippedByBudget(
  paths: readonly string[],
  tokensOf: (path: string) => number | null,
  budget: number,
): Set<string> {
  const skipped = new Set<string>();
  let total = 0;
  let over = false;
  for (const p of paths) {
    const t = tokensOf(p);
    if (t == null) continue;
    if (over || total + t > budget) {
      over = true;
      skipped.add(p);
      continue;
    }
    total += t;
  }
  return skipped;
}

/** Move `path` one step within `paths`; returns the same array when it can't move. */
export function movePath(paths: readonly string[], path: string, dir: -1 | 1): string[] {
  const idx = paths.indexOf(path);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= paths.length) return [...paths];
  const out = [...paths];
  [out[idx], out[next]] = [out[next]!, out[idx]!];
  return out;
}

/** Drop `dragged` before/after `target` (both must be in `paths`). */
export function dropPath(paths: readonly string[], dragged: string, target: string, after: boolean): string[] {
  if (dragged === target) return [...paths];
  const without = paths.filter((p) => p !== dragged);
  const idx = without.indexOf(target);
  if (idx === -1) return [...paths];
  without.splice(after ? idx + 1 : idx, 0, dragged);
  return without;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago". */
export function relativeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
