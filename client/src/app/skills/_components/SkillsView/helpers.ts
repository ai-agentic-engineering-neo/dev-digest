import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.type.includes(q),
  );
}

/** The page URL for one skill and editor tab (`/skills?skill=<id>&tab=<tab>`). */
export function skillsHref(id: string, tab: string): string {
  const sp = new URLSearchParams({ skill: id });
  if (tab && tab !== "config") sp.set("tab", tab);
  return `/skills?${sp.toString()}`;
}
