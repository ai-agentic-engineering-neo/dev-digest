/* PreviewTab — the skill body rendered the way the reviewing agent receives it.
   One source of truth: the same `body` string the editor saves. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("preview.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 18px" }}>
        {t("preview.subtitle")}
      </p>
      <Card style={{ fontSize: 14 }}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : t("preview.empty")}
      </Card>
    </div>
  );
}
