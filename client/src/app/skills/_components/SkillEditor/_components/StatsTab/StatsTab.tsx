"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Donut, ErrorState, Icon, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../lib/hooks/skills";
import { formatRatio } from "../../../../helpers";
import { RadialGauge } from "./_components/RadialGauge";
import { categoryColor } from "./helpers";
import { s } from "./styles";

/**
 * Stats — every tile is run-level (§7.2): PULL FREQUENCY and ACCEPT RATE
 * render "—" rather than "0%" whenever their denominator is zero. The hint
 * behind each tile rides along as a `title` tooltip rather than a caption
 * line, so the grid stays four clean label+number tiles.
 */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <Skeleton height={90} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.tileGrid}>
        <div style={s.tile} title={t("stats.usedByHint")}>
          <MetricCard label={t("stats.usedBy")} value={stats.used_by} />
        </div>
        <div style={s.tile} title={t("stats.pullFrequencyHint")}>
          <MetricCard label={t("stats.pullFrequency")} value={formatRatio(stats.pull_frequency)} />
        </div>
        <div style={s.tile} title={t("stats.acceptRateHint")}>
          <MetricCard
            label={t("stats.acceptRate")}
            value={
              <span style={s.gaugeValue}>
                {formatRatio(stats.accept_rate)}
                {stats.accept_rate != null && <RadialGauge ratio={stats.accept_rate} />}
              </span>
            }
          />
        </div>
        <div style={s.tile} title={t("stats.findingsHint")}>
          <MetricCard label={t("stats.findingsWithWindow", { days: stats.window_days })} value={stats.findings} />
        </div>
      </div>

      <div style={s.columns}>
        <div style={s.section}>
          <div style={s.sectionTitle}>
            <Icon.Cpu size={13} />
            {t("stats.agentsUsing")}
          </div>
          {stats.agents.length === 0 && <div style={s.emptyNote}>{t("stats.noAgents")}</div>}
          {stats.agents.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}?tab=config`} style={s.agentRow}>
              <span style={s.agentAvatar}>
                <Icon.Cpu size={14} />
              </span>
              <span style={s.agentName}>{a.name}</span>
              <span style={s.agentOpen}>{t("stats.openAgent")}</span>
            </Link>
          ))}
        </div>

        <div style={s.section}>
          <div style={s.sectionTitle}>
            <Icon.Tag size={13} />
            {t("stats.byCategory")}
          </div>
          {stats.by_category.length === 0 ? (
            <div style={s.emptyNote}>{t("stats.noCategories")}</div>
          ) : (
            // `valuePrefix=""` on purpose: `by_category[].count` is a plain
            // integer count. The mockup's "$52.00" was placeholder noise and
            // spec §7.2 rejected it — a category is not money.
            <Donut
              valuePrefix=""
              segments={stats.by_category.map((c, i) => ({
                label: c.category,
                value: c.count,
                color: categoryColor(i),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
