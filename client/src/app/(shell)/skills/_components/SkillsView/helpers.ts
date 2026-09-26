import type { Skill } from "@devdigest/shared";
import { NO_DATA } from "@/lib/format";

/** Case-insensitive filter over a skill's name + description (mirrors
   agents/_components/AgentsListView/helpers.ts's filterAgents). */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}

/** A 0..1 rate as a rounded percentage string; null/undefined -> em dash
   (S10: a missing rate means "no data", never "0%"). Shared by SkillCard's
   footer and the Stats tab's metric tiles. */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return NO_DATA;
  return `${Math.round(rate * 100)}%`;
}
