/* PreviewTab — the skill body rendered as Markdown, as the reviewing agent receives it. */
"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("previewTab.title")}</h2>
      <p style={s.subtitle}>{t("previewTab.subtitle")}</p>
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
