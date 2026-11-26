/* PreviewTab — the SAVED body rendered as the reviewing agent receives it.
   <Markdown> is GFM without raw HTML, so a <script> in a body is never executed. */
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
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <article style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </article>
    </div>
  );
}
