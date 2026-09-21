"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — the skill body rendered as the reviewing agent receives it
    (skill bodies are inserted into the prompt as-is, not wrapped). */
export function SkillPreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <div style={s.card}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <span style={s.empty}>{t("preview.empty")}</span>}
      </div>
    </div>
  );
}
