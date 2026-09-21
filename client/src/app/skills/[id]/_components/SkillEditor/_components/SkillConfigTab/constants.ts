import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels resolve via `listItem.type.*`). */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Rows for the Markdown body textarea. */
export const BODY_ROWS = 14;
