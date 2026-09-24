/* Findings support for the DiffViewer (server/specs/06-smart-diff.md). A
   feature-agnostic slot: the viewer only needs each item's file/line/severity
   and a way to render its card — the caller (DiffTab) supplies both the data
   and the card. Anchoring mirrors comments.ts's keysForLine/partitionThreads,
   but findings only ever anchor to the new (RIGHT) line. */
import type { ReactNode } from "react";
import type { Severity } from "@/lib/types";
import type { Line } from "./helpers";

/** The minimal shape the DiffViewer needs to place a finding on a line. */
export interface DiffFindingItem {
  id: string;
  file: string;
  start_line: number;
  severity: Severity;
}

/** What FileCard/CodeLine need to render findings — supplied by the caller. */
export interface DiffFindingApi<T extends DiffFindingItem = DiffFindingItem> {
  items: T[];
  /** File paths that have at least one finding — drives the file-card dot. */
  flagged: Set<string>;
  show: boolean;
  renderCard: (item: T) => ReactNode;
}

/** `RIGHT:${start_line}` — findings only ever anchor to the new (right-hand) line. */
export function findingKey(startLine: number): string {
  return `RIGHT:${startLine}`;
}

/**
 * Split one file's findings into those that land on a rendered line (keyed,
 * like comments.ts's partitionThreads) and "unmatched" ones whose line isn't
 * in the current patch — surfaced separately so nothing silently disappears
 * (server/specs/06-smart-diff.md, "a finding whose line isn't in the diff").
 */
export function partitionFindings<T extends DiffFindingItem>(
  items: readonly T[],
  file: string,
  lines: readonly Line[],
): { matched: Map<string, T[]>; unmatched: T[] } {
  const renderedKeys = new Set<string>();
  for (const ln of lines) {
    if ((ln.kind === "add" || ln.kind === "ctx") && ln.newNo != null) renderedKeys.add(findingKey(ln.newNo));
  }
  const matched = new Map<string, T[]>();
  const unmatched: T[] = [];
  for (const item of items) {
    if (item.file !== file) continue;
    const key = findingKey(item.start_line);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(item);
      matched.set(key, list);
    } else {
      unmatched.push(item);
    }
  }
  return { matched, unmatched };
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** The highest-severity item in a (non-empty) list — drives the line's stripe/label. */
export function topSeverity<T extends DiffFindingItem>(items: readonly T[]): Severity | null {
  if (items.length === 0) return null;
  return items.reduce<Severity>(
    (top, item) => (SEVERITY_RANK[item.severity] > SEVERITY_RANK[top] ? item.severity : top),
    items[0]!.severity,
  );
}
