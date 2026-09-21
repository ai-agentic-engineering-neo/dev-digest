import type { Skill, SkillType } from "@devdigest/shared";

/**
 * Accent colour per skill type. Shared with the agent editor's Skills tab so a
 * skill looks the same wherever it appears — the badge is how you recognise
 * "that's the security one" at a glance in both places.
 */
const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

export function typeColor(type: SkillType): string {
  return TYPE_COLORS[type] ?? TYPE_COLORS.custom;
}

/**
 * Whether this skill's body is someone else's text. Drives the "needs vetting"
 * affordance in the UI — and mirrors the server rule that decides whether the
 * body is delimiter-wrapped as untrusted in the prompt.
 */
export function isUntrustedSource(source: Skill["source"]): boolean {
  return source !== "manual";
}
