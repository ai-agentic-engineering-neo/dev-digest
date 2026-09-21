import type { FindingRecord } from "@devdigest/shared";

/** The finding a file's "N findings" badge should jump to on click — the
   earliest (by start_line) finding in that file. Pure so it's unit-testable
   without rendering. */
export function firstFindingForFile(
  findings: FindingRecord[],
  path: string,
): FindingRecord | undefined {
  return findings
    .filter((f) => f.file === path)
    .sort((a, b) => a.start_line - b.start_line)[0];
}
