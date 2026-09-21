import type { Skill, SkillSource } from "@devdigest/shared";
import { UNTRUSTED_SOURCES } from "./constants";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills<T extends Pick<Skill, "name" | "description">>(skills: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/** Rounded percentage string ("74%"), or `null` when there is no data yet. */
export function formatPercent(value: number | null | undefined): string | null {
  return value == null ? null : `${Math.round(value)}%`;
}

/** Non-manual skills carry a "needs vetting" hint (a UI hint, not a gate). */
export function needsVetting(source: SkillSource): boolean {
  return UNTRUSTED_SOURCES.includes(source);
}
