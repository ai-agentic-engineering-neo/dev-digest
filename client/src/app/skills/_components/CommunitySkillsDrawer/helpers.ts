import type { CommunitySkill } from "@devdigest/shared";

/** Distinct tags of the catalog, alphabetically (the filter chips). */
export function catalogTags(skills: readonly CommunitySkill[] | undefined): string[] {
  return [...new Set((skills ?? []).flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b));
}
