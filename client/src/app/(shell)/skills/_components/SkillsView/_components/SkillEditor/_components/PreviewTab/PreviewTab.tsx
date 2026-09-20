/* PreviewTab — read-only rendered body + a rough token-count badge.
   react-markdown v9 escapes raw HTML by default, so an imported body renders
   safely without rehype-raw or a sanitizer dependency. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { estimateTokens } from "./helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.badgeRow}>
        <Badge mono>{t("preview.tokens", { count: estimateTokens(skill.body) })}</Badge>
      </div>
      <Markdown>{skill.body}</Markdown>
    </div>
  );
}
