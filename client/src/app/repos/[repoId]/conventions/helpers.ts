import type { ConventionCandidate } from "@devdigest/shared";
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from "./constants";

/** How long ago a scan ran, as a message key under `page.age` and a count. */
export type ScanAge = { key: "justNow" | "minutes" | "hours" | "days"; count: number };

/** Bucket the time since `iso` for the "last scan …" label. `now` is a parameter so tests stay deterministic. */
export function scanAge(iso: string, now: number): ScanAge {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return { key: "justNow", count: 0 };
  if (minutes < MINUTES_PER_HOUR) return { key: "minutes", count: minutes };
  if (minutes < MINUTES_PER_DAY) return { key: "hours", count: Math.floor(minutes / MINUTES_PER_HOUR) };
  return { key: "days", count: Math.floor(minutes / MINUTES_PER_DAY) };
}

/** The candidates the user accepted, in list order. */
export function acceptedOnly(candidates: readonly ConventionCandidate[]): ConventionCandidate[] {
  return candidates.filter((c) => c.status === "accepted");
}

/** `path:start-end`, `path:line`, or the bare path when the range is unknown. */
export function evidenceLocation(c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">): string {
  const { evidence_path: path, evidence_start_line: start, evidence_end_line: end } = c;
  if (start == null) return path;
  return end != null && end !== start ? `${path}:${start}-${end}` : `${path}:${start}`;
}
