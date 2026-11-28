import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** Colour per skill type (rubric blue, convention green, security red, custom grey). */
export const SKILL_TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

export const SKILL_SOURCE_ICONS: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_url: "Upload",
  imported_file: "Upload",
  extracted: "Sparkles",
  community: "Globe",
};

/** Sources that put someone else's text in the prompt (shown with a warning tint). */
export const THIRD_PARTY_SOURCES: readonly SkillSource[] = ["imported_url", "imported_file", "community"];

/** Skill types in display order. Mirrors the `SkillType` enum — the client can
    only `import type` from @devdigest/shared (its barrel isn't webpack-resolvable). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
