"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Renders the exact S3 block format an agent's prompt assembly appends for
   this skill: `### Skill: <name>\n<description>\n\n<body>`. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const block = `### Skill: ${skill.name}\n${skill.description}\n\n${skill.body}`;
  return (
    <div style={s.wrap}>
      <div style={s.heading}>{t("rendered.heading")}</div>
      <div style={s.panel}>
        <Markdown>{block}</Markdown>
      </div>
    </div>
  );
}
