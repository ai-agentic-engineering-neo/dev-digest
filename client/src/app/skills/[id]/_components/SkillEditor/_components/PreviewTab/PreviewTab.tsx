/* PreviewTab — renders the skill's raw body through Markdown exactly as it
   lands in the assembled review prompt's "## Skills / rules" section. No
   special processing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.subtitle}>{t("previewTab.subtitle")}</div>
      <div style={s.panel}>
        {skill.body ? <Markdown>{skill.body}</Markdown> : <div style={s.empty}>{t("previewTab.empty")}</div>}
      </div>
    </div>
  );
}
