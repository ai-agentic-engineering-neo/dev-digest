/* Review-finding support for the DiffViewer. Pure helpers + the API shape the
   viewer needs to render findings inline (under the matching line). */
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { lineKey, partitionByKey } from "./comments";

/** What the viewer needs to render + act on review findings. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** Paths that get a dot on their file card. */
  flaggedPaths: ReadonlySet<string>;
  onAction: (findingId: string, action: FindingActionKind) => void;
  pendingFindingId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** Findings anchor on the new-file side (RIGHT) at their start line. */
export function findingKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/** Split a file's findings into ones anchored to a rendered line and off-diff ones. */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, FindingRecord[]>; offDiff: FindingRecord[] } {
  const { matched, rest } = partitionByKey(fileFindings, findingKey, renderedKeys);
  return { matched, offDiff: rest };
}
