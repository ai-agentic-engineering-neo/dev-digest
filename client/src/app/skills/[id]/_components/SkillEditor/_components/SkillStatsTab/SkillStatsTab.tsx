"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MetricCard, Donut, CircularScore, Card, SectionLabel, Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { DONUT_SIZE, DONUT_STROKE, RING_SIZE, RING_STROKE } from "./constants";
import { roundPercent, toCategorySegments } from "./helpers";
import { s } from "./styles";

/** Stats tab — usage tiles, agents using the skill, findings-by-category donut. */
export function SkillStatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={100} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const none = t("stats.noValue");
  const pull = roundPercent(stats.pull_rate);
  const accept = roundPercent(stats.accept_rate);
  const segments = toCategorySegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard
          label={t("stats.usedBy")}
          value={stats.used_by}
          suffix={` ${t("stats.usedByUnit", { count: stats.used_by })}`}
        />
        <MetricCard label={t("stats.pullFrequency")} value={pull ?? none} suffix={pull == null ? undefined : "%"} />
        <div style={s.tileWrap}>
          <MetricCard label={t("stats.acceptRate")} value={accept ?? none} suffix={accept == null ? undefined : "%"} />
          {accept != null && (
            <div style={s.ring}>
              <CircularScore score={accept} size={RING_SIZE} stroke={RING_STROKE} />
            </div>
          )}
        </div>
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d} />
      </div>

      <div style={s.panels}>
        <Card>
          <SectionLabel icon="Cpu">{t("stats.agentsUsing")}</SectionLabel>
          {stats.agents_using.length === 0 ? (
            <p style={s.empty}>{t("stats.noAgents")}</p>
          ) : (
            stats.agents_using.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <div style={s.agentIcon}>
                  <Icon.Cpu size={13} />
                </div>
                <span style={s.agentName}>{a.name}</span>
                <Link href={`/agents/${a.id}?tab=skills`} style={s.openLink} aria-label={t("stats.openAria", { name: a.name })}>
                  {t("stats.open")}
                </Link>
              </div>
            ))
          )}
        </Card>
        <Card>
          <SectionLabel icon="Tag">{t("stats.findingsByCategory")}</SectionLabel>
          {segments.length === 0 ? (
            <p style={s.empty}>{t("stats.noFindings")}</p>
          ) : (
            <div style={s.donutWrap}>
              <Donut segments={segments} size={DONUT_SIZE} stroke={DONUT_STROKE} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
