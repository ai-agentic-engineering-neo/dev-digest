/* SkillPreviewTab — the body as the reviewing agent receives it (third-party note first when applicable). */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { isThirdPartySource } from "@/lib/skills";
import { MD_COMPONENTS } from "./constants";
import { s } from "./styles";

export function SkillPreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div>
      <h3 style={s.title}>{t("previewTab.title")}</h3>
      <p style={s.caption}>{t("previewTab.caption")}</p>
      <div style={s.card}>
        {isThirdPartySource(skill.source) && <blockquote style={s.note}>{t("previewTab.thirdParty")}</blockquote>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {skill.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
