/* PreviewTab — the exact block the agent receives (server-rendered via the same
   formatter the run uses) and its token cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillPreview } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillPreview(skill.id);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <h2 style={s.h2}>{t("preview.title")}</h2>
          <div style={s.sub}>{t("preview.subtitle")}</div>
        </div>
        {data && (
          <span style={s.tokens}>
            <Badge mono>{t("preview.tokens", { count: data.tokens })}</Badge>
          </span>
        )}
      </div>
      {isLoading && <Skeleton height={200} />}
      {isError && <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />}
      {data && (
        <pre className="mono" style={s.pre} data-testid="skill-preview">
          {data.block}
        </pre>
      )}
    </div>
  );
}
