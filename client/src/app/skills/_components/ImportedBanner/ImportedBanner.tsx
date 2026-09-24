/* ImportedBanner — trust reminder on a skill that did not start in DevDigest
   (source ≠ manual): read it before enabling it. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function ImportedBanner({ skill }: { skill: Pick<Skill, "source" | "source_ref"> }) {
  const t = useTranslations("skills");
  if (skill.source === "manual") return null;
  return (
    <div role="note" style={s.banner}>
      <Icon.AlertTriangle size={15} style={s.icon} />
      <span>{t("imported.banner", { ref: skill.source_ref || t(`source.${skill.source}`) })}</span>
    </div>
  );
}
