import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon next to the source label on a card (mockup: pencil / wrench / globe). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported: "Upload",
  imported_url: "Link",
};
