/* StatsTab — 30-day usage of one skill: how many agents use it, how often it
   was in a run's prompt (pull frequency), the accept rate and categories of
   findings from those runs. Correlated, not causal — said so on screen. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Donut, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatRate } from "@/lib/format-rate";
import { CATEGORY_COLORS, FALLBACK_CATEGORY_COLOR } from "./constants";
import { StatTile } from "./_components/StatTile";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={260} />;
  if (isError || !data) return <ErrorState title={t("stats.loadError")} onRetry={() => refetch()} />;

  const segments = data.by_category.map((c) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLORS[c.category] ?? FALLBACK_CATEGORY_COLOR,
  }));

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <StatTile
          label={t("stats.usedBy").toUpperCase()}
          value={data.used_by.length}
          unit={t("stats.agentsUnit", { count: data.used_by.length })}
        />
        <StatTile label={t("stats.pullFrequency").toUpperCase()} value={formatRate(data.pull_rate)} />
        <StatTile
          label={t("stats.acceptRate").toUpperCase()}
          value={formatRate(data.accept_rate)}
          ring={data.accept_rate}
          color="var(--warn)"
        />
        <StatTile label={t("stats.findings").toUpperCase()} value={data.findings_30d} />
      </div>

      <div style={s.panels}>
        <section style={s.panel}>
          <div style={s.panelTitle}>
            <Icon.Cpu size={13} />
            {t("stats.agentsTitle")}
          </div>
          {data.used_by.length === 0 ? (
            <div style={s.empty}>{t("stats.noAgents")}</div>
          ) : (
            data.used_by.map((a) => (
              <div key={a.agent_id} style={s.agentRow}>
                <Icon.Cpu size={14} style={{ color: "var(--text-muted)" }} />
                <span style={s.agentName}>{a.name}</span>
                <Button kind="ghost" size="sm" onClick={() => router.push(`/agents/${a.agent_id}?tab=skills`)}>
                  {t("stats.open")}
                </Button>
              </div>
            ))
          )}
        </section>
        <section style={s.panel}>
          <div style={s.panelTitle}>
            <Icon.Tag size={13} />
            {t("stats.byCategory")}
          </div>
          {segments.length === 0 ? (
            <div style={s.empty}>{t("stats.noFindings")}</div>
          ) : (
            <Donut segments={segments} formatValue={(v) => String(v)} />
          )}
        </section>
      </div>
      <p style={s.note}>{t("stats.correlationNote")}</p>
    </div>
  );
}
