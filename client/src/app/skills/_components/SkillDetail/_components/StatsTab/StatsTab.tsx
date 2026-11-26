/* StatsTab — skill usage from existing tables only (SPEC §3.4 / §5.5): four
   MetricCards and the attached agents' own 30-day activity. */
"use client";

import { useLocale, useNow, useTranslations } from "next-intl";
import { EmptyState, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill, SkillStats } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { AgentActivityRow } from "./_components/AgentActivityRow";
import { SKELETON_METRICS, SKELETON_ROWS } from "./constants";
import { formatDay, formatRelative } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.stats");
  const stats = useSkillStats(skill.id);

  if (stats.isPending) return <StatsSkeleton />;
  if (stats.isError || !stats.data) {
    return <ErrorState title={t("loadError")} onRetry={() => void stats.refetch()} />;
  }
  return (
    <div style={s.root}>
      <StatsMetrics stats={stats.data} />
      <section style={s.panel} aria-labelledby="skill-stats-agents">
        <header style={s.panelHeader}>
          <h3 id="skill-stats-agents" style={s.panelTitle}>
            {t("panelTitle")}
          </h3>
          <span style={s.panelSub}>{t("panelSub")}</span>
        </header>
        {stats.data.agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <ul style={s.list}>
            {stats.data.agents.map((agent) => (
              <AgentActivityRow key={agent.agent_id} agent={agent} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatsMetrics({ stats }: { stats: SkillStats }) {
  const t = useTranslations("skills.stats");
  const locale = useLocale();
  const now = useNow();
  return (
    <div style={s.metrics}>
      <MetricCard
        label={t("usedBy")}
        value={
          <>
            <span style={s.metricValue}>{t("usedByValue", { count: stats.agent_count })}</span>
            <span style={s.metricSub}>{t("enabledSub", { count: stats.enabled_agent_count })}</span>
          </>
        }
      />
      <MetricCard label={t("versions")} value={<span style={s.metricValue}>{stats.version_count}</span>} />
      <MetricCard
        label={t("lastEdited")}
        value={
          <span style={s.metricValue} title={formatDay(stats.updated_at)}>
            {formatRelative(stats.updated_at, now, locale)}
          </span>
        }
      />
      <MetricCard label={t("created")} value={<span style={s.metricValue}>{formatDay(stats.created_at)}</span>} />
    </div>
  );
}

function StatsSkeleton() {
  const t = useTranslations("skills.stats");
  return (
    <div style={s.root} aria-busy="true" aria-label={t("loading")}>
      <div style={s.metrics}>
        {SKELETON_METRICS.map((key) => (
          <Skeleton key={key} height={92} style={s.skeletonMetric} />
        ))}
      </div>
      <div style={s.panel}>
        {SKELETON_ROWS.map((key) => (
          <div key={key} style={s.skeletonRow}>
            <Skeleton height={18} />
          </div>
        ))}
      </div>
    </div>
  );
}
