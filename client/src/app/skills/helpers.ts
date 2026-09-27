import type { Skill, SkillSource } from "@devdigest/shared";
import { SKILL_TAB_KEYS } from "./constants";

/**
 * Helpers shared by more than one component under /skills. They sit at the
 * route segment, not inside whichever component happened to need them first —
 * SkillsList, SkillDetail and ConfigTab all read them.
 */

/**
 * True when a skill's text came from outside this workspace.
 *
 * The authoritative copy of this rule is `isThirdPartySkill` in the contracts,
 * which the SERVER applies where it matters (an import lands disabled; the
 * prompt block is labelled third-party). It cannot be imported here — the
 * client's vendored contracts are type-only at build time — and this copy only
 * drives a badge, so the duplication is bounded to presentation.
 */
const THIRD_PARTY: readonly SkillSource[] = ["community", "imported_url"];

export function isThirdParty(source: SkillSource): boolean {
  return THIRD_PARTY.includes(source);
}

/** Accent colour per skill type — the chip on the card and in the detail header. */
export function typeColor(type: Skill["type"]): string {
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

/** The tab a URL asks for, or Config when it asks for nothing valid. */
export function resolveSkillTab(requested: string | null | undefined): string {
  return requested && SKILL_TAB_KEYS.includes(requested) ? requested : "config";
}

/** `/skills/<id>?tab=<tab>` — the one address of "this skill, this tab". */
export function skillHref(id: string, tab?: string | null): string {
  return `/skills/${encodeURIComponent(id)}?tab=${resolveSkillTab(tab)}`;
}
