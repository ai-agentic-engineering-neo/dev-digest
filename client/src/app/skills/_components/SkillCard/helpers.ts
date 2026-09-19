import type { SkillSource, SkillType } from "@devdigest/shared";

/** A stable accent colour per skill type, for the icon + type chip. */
export function typeColor(type: SkillType): string {
  switch (type) {
    case "security":
      return "var(--crit)";
    case "rubric":
      return "var(--accent)";
    case "convention":
      return "var(--warn)";
    default:
      return "var(--text-secondary)";
  }
}

/** A source counts as needing vetting when it did not originate inside the
 * workspace itself (§10) — the badge, not a claim about the body's safety. */
export function needsVettingBadge(source: SkillSource): boolean {
  return source !== "manual" && source !== "extracted";
}
