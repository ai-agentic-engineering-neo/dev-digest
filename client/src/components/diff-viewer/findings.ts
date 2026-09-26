/* Finding-marker support for the DiffViewer (Smart Order, L03). Pure helpers
   + the slot contract the viewer needs; the actual card component lives at
   the route (`FindingCard`) and is passed in — diff-viewer never imports
   route-local code (frontend-ui-architecture §2, §10). */
import type { ComponentType } from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";

/** Props the slotted-in finding card must accept. A real implementation
    (`FindingCard`) may accept more optional props than this. */
export interface InlineFindingCardProps {
  f: FindingRecord;
  defaultExpanded?: boolean;
  pending?: boolean;
  onAction?: (a: FindingActionKind) => void;
  /** Collapse the card back under its line badge. Absent where there is
      nothing to collapse to (the unanchored block). */
  onClose?: () => void;
}

/** What the viewer needs to read + act on findings, anchored per file. */
export interface DiffFindingApi {
  byFile: ReadonlyMap<string, FindingRecord[]>;
  Card: ComponentType<InlineFindingCardProps>;
  pending: boolean;
  onAction: (findingId: string, a: FindingActionKind) => void;
}

/** A finding only ever anchors to its RIGHT (new-side) line — never LEFT,
    never the nearest line. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string {
  return `RIGHT:${f.start_line}`;
}

/** Split a file's findings into ones that land on a rendered line vs. ones
    that don't (deleted file, `patch: null`, or a start_line outside every
    rendered hunk) — the "unanchored" bucket, never attached to the nearest
    line (in the spirit of `partitionThreads`). */
export function partitionFindings(
  fs: FindingRecord[],
  renderedKeys: Set<string>,
): { byKey: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const byKey = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of fs) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = byKey.get(key) ?? [];
      list.push(f);
      byKey.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { byKey, unanchored };
}
