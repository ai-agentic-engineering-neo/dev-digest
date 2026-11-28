/* PreviewTab — the skill exactly as the reviewing agent receives it: the
   `### Skill: <name>` block rendered by the server with the same function the
   review engine uses, plus its token cost per prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useSkillPreview } from "@/lib/hooks/skills";

export function PreviewTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillPreview(skillId);
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("preview.title")}</h2>
        {data && (
          <Badge color="var(--text-secondary)" icon="Hash">
            {t("preview.tokens", { count: data.tokens })}
          </Badge>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" }}>{t("preview.subtitle")}</p>
      {isLoading ? (
        <Skeleton height={240} />
      ) : isError || !data ? (
        <ErrorState title={t("preview.loadError")} onRetry={() => refetch()} />
      ) : (
        <div
          data-testid="skill-preview-block"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            padding: "8px 22px",
          }}
        >
          <Markdown>{data.block}</Markdown>
        </div>
      )}
    </div>
  );
}
