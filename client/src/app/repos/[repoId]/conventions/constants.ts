import type { ConventionCategory } from "@devdigest/shared";

/** Filter chips in display order (labels: conventions.toolbar.*). */
export const STATUS_FILTERS = ["all", "pending", "accepted", "rejected"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Categories in the edit select (labels: conventions.category.*); mirrors the contract enum. */
export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "error-handling",
  "async",
  "types",
  "imports",
  "testing",
  "api",
  "data-access",
  "style",
  "other",
];

/** Confidence at or above → green bar; at or above WARN → amber; below → red. */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_WARN = 0.6;
