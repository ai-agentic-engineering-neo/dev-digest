import type { Convention, ConventionEvidence, ConventionStatus } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_WARN, type StatusFilter } from "./constants";

export type StatusCounts = Record<StatusFilter, number>;

export function countByStatus(list: readonly Convention[]): StatusCounts {
  const counts: StatusCounts = { all: list.length, pending: 0, accepted: 0, rejected: 0 };
  for (const c of list) counts[c.status] += 1;
  return counts;
}

export function filterByStatus(list: readonly Convention[], filter: StatusFilter): Convention[] {
  return filter === "all" ? [...list] : list.filter((c) => c.status === filter);
}

/** Clicking the active Accept/Reject button again resets the rule to pending. */
export function nextStatus(current: ConventionStatus, clicked: Exclude<ConventionStatus, "pending">): ConventionStatus {
  return current === clicked ? "pending" : clicked;
}

export type ConfidenceTone = "high" | "warn" | "low";

export function confidenceTone(confidence: number): ConfidenceTone {
  if (confidence >= CONFIDENCE_HIGH) return "high";
  if (confidence >= CONFIDENCE_WARN) return "warn";
  return "low";
}

/** `path:12` for one line, `path:12-18` for a range. */
export function evidenceLabel(e: Pick<ConventionEvidence, "path" | "start_line" | "end_line">): string {
  return e.end_line > e.start_line ? `${e.path}:${e.start_line}-${e.end_line}` : `${e.path}:${e.start_line}`;
}

export type RelativeAge = { unit: "justNow" } | { unit: "minutes" | "hours" | "days"; count: number };

/** Coarse age of an ISO timestamp for "last scan 1h ago" (keys: conventions.time.*). */
export function relativeAge(iso: string, now: number = Date.now()): RelativeAge {
  const minutes = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return { unit: "justNow" };
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}
