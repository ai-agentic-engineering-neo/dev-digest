import type { SkillSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Source label icon (design: Manual · Extracted · Community · Imported). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};
