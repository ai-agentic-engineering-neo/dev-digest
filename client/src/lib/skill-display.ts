/**
 * Skill type/source display constants (icon + colour + label lookups).
 *
 * Lives in `lib/` rather than under the /skills route because a second
 * consumer needs it: the agent editor's Skills tab (`/agents/:id?tab=skills`)
 * renders the same type badges as the /skills screen's SkillCard and detail
 * header. A route-colocated constant used by a sibling route drifts the moment
 * one side edits it — same reasoning as `lib/severity.ts` for SEVERITY_ORDER.
 */
import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** Every SkillType, for the Config tab's Type select. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Icon per skill type (SkillCard icon box, detail header, agent Skills tab rows). */
export const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "FileText",
  security: "Shield",
  custom: "Wrench",
};

/** Chip colour per skill type — component-owned hex, same pattern as
   AgentCard's MODEL_COLOR (no shared token exists for skill types). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#8b5cf6",
  security: "#ef4444",
  custom: "#f59e0b",
};

/** Icon per skill source (SkillCard source label). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "User",
  extracted: "Brain",
  community: "Globe",
  imported_url: "Upload",
  imported_file: "Upload",
};

/** Sources that render the "needs vetting" badge while disabled — an
   untrusted body that has not been reviewed yet. */
export const UNTRUSTED_SOURCES: readonly SkillSource[] = ["imported_url", "imported_file"];
