/* Preview tab — the exact block the run executor injects, monospaced, with its
   real token count in the panel header. Rendered server-side by the SAME
   `renderSkillBlock` the executor uses; if the two ever diverge this tab lies. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillPreview } from "@/lib/hooks/skills";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillPreview(skill.id);

  if (isLoading) return <Skeleton height={280} />;
  if (isError || !data) {
    return <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.panel}>
        <div style={s.head}>
          <span style={s.title}>{t("preview.title")}</span>
          <span className="tnum" style={s.tokens}>
            {t("preview.tokens", { count: data.tokens })}
          </span>
        </div>
        <pre className="mono" style={s.block}>
          {data.block}
        </pre>
      </div>
      {/* AC-13/D1 — the skill's attached documents, rendered by the SAME
          `## Project context` renderer a run actually uses; omitted when the
          skill has no attached documents, matching the run's own
          omit-when-empty contract for this section. */}
      {data.project_context_block != null && (
        <div style={s.panel}>
          <div style={s.head}>
            <span style={s.title}>{t("preview.contextTitle")}</span>
            <span className="tnum" style={s.tokens}>
              {t("preview.tokens", { count: data.project_context_tokens })}
            </span>
          </div>
          <pre className="mono" style={s.block}>
            {data.project_context_block}
          </pre>
        </div>
      )}
      <p style={s.hint}>{t("preview.hint")}</p>
    </div>
  );
}
