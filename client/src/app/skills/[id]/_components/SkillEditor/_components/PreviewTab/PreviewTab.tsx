"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — body only, as the reviewing agent receives it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.label}>{t("previewTab.label")}</div>
      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
