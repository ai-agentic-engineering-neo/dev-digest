/** Pure helpers for the Overview brief: refs and focus rows. */
import type { PrBriefFocusItem } from "@devdigest/shared";

export interface DiffTarget {
  path: string;
  line: number | null;
}

/** "a.ts", "a.ts:12" or "a.ts:12-20" → the path and the start line (D7). */
export function parseRef(ref: string): DiffTarget {
  const m = ref.trim().match(/^(.*?):(\d+)(?:-\d+)?$/);
  if (!m) return { path: ref.trim(), line: null };
  return { path: m[1]!, line: Number(m[2]) };
}

/** `path:line` for a focus item, just `path` when no line applies. */
export function formatFocusRef(item: Pick<PrBriefFocusItem, "path" | "line">): string {
  return item.line == null ? item.path : `${item.path}:${item.line}`;
}
