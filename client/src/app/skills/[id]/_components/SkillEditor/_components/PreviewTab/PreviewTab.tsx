"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "../../styles";

/** Preview tab — the body rendered as Markdown, as an agent's prompt carries it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("editor.preview.title")}</h2>
      <div style={s.hint}>{t("editor.preview.hint")}</div>
      <div style={s.markdown} data-testid="skill-preview">
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
