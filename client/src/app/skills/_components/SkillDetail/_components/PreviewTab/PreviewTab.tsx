/* PreviewTab — the SAVED body rendered as the reviewing agent receives it.
   <Markdown> is GFM without raw HTML, so a <script> in a body is never executed.
   A body with scan findings is also shown as text with the findings in yellow
   (rendered Markdown would hide e.g. an HTML comment or invisible characters). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { HighlightedBody } from "@/app/skills/_components/SkillSafety";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const findings = skill.safety?.findings ?? [];
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      {findings.length > 0 && (
        <div style={s.highlight}>
          <HighlightedBody body={skill.body} findings={findings} />
        </div>
      )}
      <article style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </article>
    </div>
  );
}
