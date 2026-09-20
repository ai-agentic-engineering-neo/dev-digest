import type { Skill } from "@devdigest/shared";
import type { SkillTab } from "../SkillDetail";

/** The id to show: the requested one when it exists, otherwise the first skill (stale/missing id). */
export function resolveSelectedId(skills: readonly Skill[], requested: string | null | undefined): string | null {
  if (requested && skills.some((sk) => sk.id === requested)) return requested;
  return skills[0]?.id ?? null;
}

/** `/skills?id=<uuid>&tab=<tab>` (id omitted when nothing is selected). */
export function buildSkillsHref(id: string | null, tab: SkillTab): string {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  params.set("tab", tab);
  return `/skills?${params.toString()}`;
}
