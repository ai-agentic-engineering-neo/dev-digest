import type { SkillType } from "@devdigest/shared";

/** The selectable skill types, in the order every picker shows them. Lives
    here because all three pickers (create modal, config tab, import drawer)
    are below this view — one list, not three copies to drift apart. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
