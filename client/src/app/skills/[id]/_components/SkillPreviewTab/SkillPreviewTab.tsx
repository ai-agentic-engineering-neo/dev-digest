/* SkillPreviewTab — the skill body rendered as Markdown, the way it reads to
   the person deciding whether to enable it. Shows the unsaved draft when there
   is one, so "preview" means "what I am about to save". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

export function SkillPreviewTab({ body }: { body: string }) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <div>
        <h2 style={s.h2}>{t("previewTab.heading")}</h2>
        <p style={s.subtitle}>{t("previewTab.subtitle")}</p>
      </div>
      <div style={s.card}>
        {body.trim() ? (
          <Markdown>{body}</Markdown>
        ) : (
          <p style={s.empty}>{t("previewTab.empty")}</p>
        )}
      </div>
    </div>
  );
}
