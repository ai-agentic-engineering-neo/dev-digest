/* PreviewTab — the skill block rendered as the reviewing agent receives it,
   including unsaved edits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Markdown } from "@devdigest/ui";
import type { SkillDraft } from "../../../../helpers";
import { isEmptyBody, previewMarkdown } from "./helpers";
import { s } from "./styles";

export function PreviewTab({ draft, dirty }: { draft: SkillDraft; dirty: boolean }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.titleRow}>
        <h2 style={s.h2}>{t("preview.title")}</h2>
        {dirty && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("editor.unsaved")}</Badge>}
      </div>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <Card style={s.card}>
        <Markdown>{previewMarkdown(draft)}</Markdown>
        {isEmptyBody(draft) && <p style={s.empty}>{t("preview.empty")}</p>}
      </Card>
    </div>
  );
}
