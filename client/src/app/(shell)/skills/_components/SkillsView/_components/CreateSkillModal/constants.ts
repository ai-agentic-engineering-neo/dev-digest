import type { SkillType } from "@devdigest/shared";

/** Default type for a new skill. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Selectable types in the create form. */
export const TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;
