import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Source badge descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SourceMeta {
  labelKey: string;
  icon: IconName;
}

/** Per-source label + icon for the row's source badge. */
export const SOURCE_META: Record<SkillSource, SourceMeta> = {
  manual: { labelKey: "listItem.source.manual", icon: "Edit" },
  extracted: { labelKey: "listItem.source.extracted", icon: "FileText" },
  community: { labelKey: "listItem.source.community", icon: "Globe" },
  imported_url: { labelKey: "listItem.source.imported_url", icon: "Upload" },
};

/** Sources that did not originate from the user typing the skill in. */
export const UNTRUSTED_SOURCES: readonly SkillSource[] = ["extracted", "community", "imported_url"];
