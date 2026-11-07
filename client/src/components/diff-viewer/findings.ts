/* Finding support for the DiffViewer: the API shape the viewer needs and the
   pure helpers that place agent findings on rendered diff lines. */
import type { ReactNode } from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

export interface DiffFindingLabels {
  /** Accessible name of a line's severity icon. */
  line: Record<Severity, string>;
  /** Title of the end-of-file block. */
  outOfPatch: string;
  /** Accessible name of one counter chip. */
  severityCount: (severity: Severity, count: number) => string;
  /** Accessible name of the file dot. */
  fileDot: (count: number) => string;
}

export interface DiffFindingApi {
  /** Latest review per agent, any file (the viewer filters by path); dismissed included. */
  findings: FindingRecord[];
  /** false hides finding cards + the out-of-patch block; bars/icons/dots/counters stay. */
  show: boolean;
  renderCard: (f: FindingRecord) => ReactNode;
  labels: DiffFindingLabels;
}

const SEVERITY_ORDER: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** The key a finding is matched on (findings anchor to the new/RIGHT side). */
export function findingLineKey(f: Pick<FindingRecord, "start_line">): string {
  return lineKey("RIGHT", f.start_line) as string;
}

/** Split findings into those on a rendered RIGHT line and the rest. */
export function partitionFindings(
  findings: readonly FindingRecord[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, FindingRecord[]>; outOfPatch: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outOfPatch: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingLineKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outOfPatch.push(f);
    }
  }
  return { matched, outOfPatch };
}

export function activeFindings(findings: readonly FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.dismissed_at === null);
}

/** Distinct severities present, most severe first. */
export function lineSeverities(findings: readonly { severity: string }[]): Severity[] {
  return SEVERITY_ORDER.filter((sev) => findings.some((f) => f.severity === sev));
}

export function topSeverity(findings: readonly { severity: string }[]): Severity | null {
  return lineSeverities(findings)[0] ?? null;
}
