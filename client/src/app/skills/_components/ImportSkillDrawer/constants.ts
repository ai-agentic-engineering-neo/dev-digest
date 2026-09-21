import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels resolve under `skills.listItem.type.*`). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const DEFAULT_SKILL_TYPE: SkillType = "custom";

/** Drawer width in px. */
export const DRAWER_WIDTH = 560;

/** Rows in the body textarea. */
export const BODY_ROWS = 12;
