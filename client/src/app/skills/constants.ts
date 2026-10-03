import type { SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Route-level: type → chip icon + colour, shared by SkillCard and
 *  SkillPreviewDrawer (mirrors pulls/constants.ts's STATUS_META pattern). */
export const SKILL_TYPE_META: Record<SkillType, { icon: IconName; color: string }> = {
  rubric: { icon: "ListChecks", color: "#3b82f6" },
  convention: { icon: "FileText", color: "#8b5cf6" },
  security: { icon: "Shield", color: "#ef4444" },
  custom: { icon: "Wrench", color: "#f59e0b" },
};

/** Card grid template (responsive auto-fill). Mirrors agents/_components/AgentsListView's CARD_GRID_COLS. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(280px, 1fr))";
