"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, CircularScore, Donut, ErrorState, Skeleton, MetricCard } from "@devdigest/ui";
import { formatPercent } from "../../../../helpers";
import { CATEGORY_COLORS } from "./constants";
import { s } from "./styles";
import { useSkillStats } from "@/lib/hooks/skills";
import { NO_DATA } from "@/lib/format";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <Skeleton height={110} />
        <Skeleton height={200} style={{ marginTop: 16 }} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.metricsRow}>
        <MetricCard label={t("stats.usedBy")} value={stats.used_by} />
        <MetricCard label={t("stats.pullFrequency")} value={formatPercent(stats.pull_rate)} />
        <div style={s.scoreCard}>
          <span style={s.scoreLabel}>{t("stats.acceptRate")}</span>
          {stats.accept_rate != null ? (
            <CircularScore score={Math.round(stats.accept_rate * 100)} />
          ) : (
            <span style={s.noData}>{NO_DATA}</span>
          )}
        </div>
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d ?? NO_DATA} />
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.agentsUsing")}</div>
        {stats.agents.length === 0 ? (
          <div style={s.noData}>{t("stats.noAgents")}</div>
        ) : (
          <div style={s.agentList}>
            {stats.agents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <span style={s.agentName}>{a.name}</span>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="ExternalLink"
                  onClick={() => router.push(`/agents/${a.id}?tab=skills`)}
                >
                  {t("stats.open")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.byCategory")}</div>
        {stats.by_category.length === 0 ? (
          <div style={s.noData}>{t("stats.noCategoryData")}</div>
        ) : (
          <Donut
            valuePrefix=""
            segments={stats.by_category.map((c, i) => ({
              label: c.category,
              value: c.count,
              color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
            }))}
          />
        )}
      </div>
    </div>
  );
}
