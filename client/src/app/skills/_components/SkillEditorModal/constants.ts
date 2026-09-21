import type { SkillType } from "@devdigest/shared";

/** Constants for SkillEditorModal. */

export const MODAL_WIDTH = 760;

/** Rows for the markdown body textarea — big enough to see a whole rule. */
export const BODY_ROWS = 14;

/** Selectable skill types, in the order the picker shows them. */
export const TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
