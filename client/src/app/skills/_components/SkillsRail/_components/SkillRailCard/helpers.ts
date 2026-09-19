import type { SkillSource, SkillType } from "@devdigest/shared";

/** A stable accent colour per skill type, for the type badge. */
export function typeColor(type: SkillType): string {
  switch (type) {
    case "security":
      return "var(--crit)";
    case "rubric":
      return "var(--accent)";
    case "convention":
      return "var(--ok)";
    default:
      return "var(--text-secondary)";
  }
}

/** The paired background token for `typeColor` — `color + "1a"` does not work
 * on a `var(--x)` reference; the design system's own tinted `-bg` tokens are
 * the real pairing. */
export function typeBg(type: SkillType): string {
  switch (type) {
    case "security":
      return "var(--crit-bg)";
    case "rubric":
      return "var(--accent-bg)";
    case "convention":
      return "var(--ok-bg)";
    default:
      return "var(--bg-hover)";
  }
}

/** A source counts as needing vetting when it did not originate inside the
 * workspace itself (§10) — the badge, not a claim about the body's safety. */
export function needsVettingBadge(source: SkillSource): boolean {
  return source !== "manual" && source !== "extracted";
}
