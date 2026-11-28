import type { Skill } from "@devdigest/shared";

/** Case-insensitive local filter over a skill's name and description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/**
 * Whether the workspace has no skills at all, so the pane offers Create and
 * Import. Not while the list loads or failed: an unknown list is not empty.
 */
export function hasNoSkills(
  skills: readonly Skill[] | undefined,
  status: { isLoading: boolean; isError: boolean },
): boolean {
  return !status.isLoading && !status.isError && (skills ?? []).length === 0;
}

/** Whether skills exist but the search hides every one of them. */
export function hasNoMatch(skills: readonly Skill[] | undefined, shown: readonly Skill[]): boolean {
  return (skills ?? []).length > 0 && shown.length === 0;
}
