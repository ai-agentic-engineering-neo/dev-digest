/* skills.ts — pure skill helpers shared by the /skills page and the agent Skills tab. */
import type { IconName } from "@devdigest/ui";
import type { Skill, SkillSource, SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Badge colour per skill type (rubric=blue, convention=green, security=red, custom=grey). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#22c55e",
  security: "#ef4444",
  custom: "var(--text-secondary)",
};

/** Case-insensitive match on name + description. */
export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
}

/** Rough token estimate (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Skill sources whose text is someone else's: the prompt prefixes them with a third-party note. */
export function isThirdPartySource(source: SkillSource): boolean {
  return source === "imported_file" || source === "imported_url" || source === "community";
}

/** Icon per skill source, shown next to the source label. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Upload",
  imported_file: "Upload",
};

/** 0..1 -> "71%"; null/undefined -> "—". */
export function formatRate(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Translucent background for a type-coloured icon tile. */
export function tintOf(color: string): string {
  return `color-mix(in srgb, ${color} 16%, transparent)`;
}
