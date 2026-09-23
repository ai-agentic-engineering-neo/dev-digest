import type { Severity } from "@devdigest/shared";

/** Sort weight — most severe first. A small, self-contained copy so this
 *  shared folder (used from both the PR list and PR detail) doesn't reach
 *  into `pulls/[number]/_components/FindingsPanel`, which is page-specific
 *  and also carries a 4th (`INFO`) UI-only level this contract doesn't have. */
export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export const SEVERITY_LEVELS: Severity[] = (
  Object.keys(SEVERITY_ORDER) as Severity[]
).sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b]);

/** Validate a `?severity=` URL param against the wire enum — anything else
 *  (missing, stale link, typo) reads as "no filter" rather than throwing. */
export function parseSeverityParam(value: string | null | undefined): Severity | null {
  return value != null && (SEVERITY_LEVELS as string[]).includes(value)
    ? (value as Severity)
    : null;
}
