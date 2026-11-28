import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Source → label icon and message key (under `skills.card.source`). */
export const SOURCE_META: Record<SkillSource, { icon: IconName; labelKey: string }> = {
  manual: { icon: "Edit", labelKey: "manual" },
  extracted: { icon: "Wrench", labelKey: "extracted" },
  community: { icon: "Globe", labelKey: "community" },
  imported_url: { icon: "Upload", labelKey: "imported_url" },
  imported_file: { icon: "Upload", labelKey: "imported_file" },
};
