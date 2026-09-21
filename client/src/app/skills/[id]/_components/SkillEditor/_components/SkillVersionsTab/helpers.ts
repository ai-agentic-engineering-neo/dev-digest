import type { SkillVersion } from "@devdigest/shared";

/** Newest version first (does not mutate the input). */
export function sortNewestFirst(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

/** Locale-formatted snapshot timestamp; falls back to the raw string if unparsable. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** How an expanded version's body is shown. */
export type BodyView = "current" | "previous" | "rendered";

/**
 * Views offered for a version: a diff against the *current* (latest) version for every
 * older one, a per-step diff against the previous version when one exists, and the
 * rendered Markdown. The latest version has nothing to diff "against current".
 */
export function availableViews(isLatest: boolean, hasPrevious: boolean): BodyView[] {
  const views: BodyView[] = [];
  if (!isLatest) views.push("current");
  if (hasPrevious) views.push("previous");
  views.push("rendered");
  return views;
}

/** The wanted view when this version offers it, else its first available one. */
export function resolveView(wanted: BodyView, available: readonly BodyView[]): BodyView {
  return available.includes(wanted) ? wanted : (available[0] ?? "rendered");
}
