"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/**
 * Renders the body exactly as the reviewing agent receives it — plain
 * rendered markdown. The `### <name>` wrapper is added at prompt-assembly
 * time (server-side); this is the skill's own body, not the agent's prompt.
 */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <div style={s.header}>{t("preview.title")}</div>
      <div style={s.subtitle}>{t("preview.subtitle")}</div>

      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
