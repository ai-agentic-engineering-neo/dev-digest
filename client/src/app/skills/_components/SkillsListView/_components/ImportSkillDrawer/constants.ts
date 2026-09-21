import type { SkillType } from "@devdigest/shared";

/** Default type for an imported skill — the import response carries no type,
    so the editable preview starts on "custom" and lets the user change it. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Selectable types in the import preview form. */
export const TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Drawer width (px). */
export const DRAWER_WIDTH = 560;

/** Accepted file extensions for the upload input. */
export const ACCEPT = ".md,.markdown,.txt,.zip";
