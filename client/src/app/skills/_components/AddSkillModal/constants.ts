import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels resolve under `skills.listItem.type.*`). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const DEFAULT_SKILL_TYPE: SkillType = "rubric";

/** Modal width in px. */
export const MODAL_WIDTH = 440;

/** Rows in the body textarea. */
export const BODY_ROWS = 6;

export type AddSkillTabKey = "create" | "file" | "url";

/** Tab order; labels resolve under `skillsImport.tabs.*`. */
export const TAB_KEYS: readonly AddSkillTabKey[] = ["create", "file", "url"];
