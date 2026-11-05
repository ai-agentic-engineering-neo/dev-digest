/* PreviewTab — the body rendered as the reviewing agent receives it. Imported
   skills carry the trust notice (they are wrapped as <untrusted> in the prompt). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isImportedSkill } from "../../helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div>
      <h2 style={s.title}>{t("previewTab.title")}</h2>
      <p style={s.subtitle}>{t("previewTab.subtitle")}</p>
      {isImportedSkill(skill) && (
        <div role="note" style={s.notice}>
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("previewTab.untrustedNotice")}</span>
        </div>
      )}
      <div style={s.card}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <p style={s.empty}>{t("previewTab.empty")}</p>}
      </div>
    </div>
  );
}
