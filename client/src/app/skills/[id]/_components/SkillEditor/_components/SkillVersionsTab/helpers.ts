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
