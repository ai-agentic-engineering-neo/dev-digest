/* StatsTab — usage of one skill: linked agents, pull frequency (share of
   those agents' runs whose prompt included it), accept rate of findings from
   those runs, and the 30-day findings breakdown by category. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, Donut, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { toPct } from "../../../../../../../lib/accept-rate";
import { CATEGORY_COLOR, FALLBACK_CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

function Tile({ label, value, suffix, extra }: { label: string; value: React.ReactNode; suffix?: string; extra?: React.ReactNode }) {
  return (
    <div style={s.tile}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {extra}
      </div>
      <div style={s.tileValue}>
        <span className="tnum">{value}</span>
        {suffix && <span style={s.tileSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) return <Skeleton height={120} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const pull = stats.pull_rate == null ? null : toPct(stats.pull_rate);
  const accept = stats.accept_rate == null ? null : toPct(stats.accept_rate);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")} value={stats.agents.length} suffix={t("stats.agentsSuffix", { count: stats.agents.length })} />
        <Tile label={t("stats.pullFrequency")} value={pull ?? "—"} suffix={pull == null ? undefined : "%"} />
        <Tile
          label={t("stats.acceptRate")}
          value={accept ?? "—"}
          suffix={accept == null ? undefined : "%"}
          extra={accept != null && <CircularScore score={accept} size={34} stroke={3} />}
        />
        <Tile label={t("stats.findings30d")} value={stats.findings_30d} />
      </div>

      <div style={s.panels}>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Cpu size={13} />
            {t("stats.agentsUsing")}
          </h3>
          {stats.agents.length === 0 ? (
            <p style={s.muted}>{t("stats.noAgents")}</p>
          ) : (
            stats.agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}?tab=skills`} style={s.agentRow(a.enabled)}>
                <span style={s.agentIcon}>
                  <Icon.Cpu size={13} />
                </span>
                <span style={s.agentName}>{a.name}</span>
                <span className="mono" style={s.open}>
                  {t("stats.open")}
                </span>
              </Link>
            ))
          )}
        </section>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Tag size={13} />
            {t("stats.byCategory")}
          </h3>
          {stats.by_category.length === 0 ? (
            <p style={s.muted}>{t("stats.noFindings")}</p>
          ) : (
            <div style={s.donut}>
              <Donut
                size={120}
                stroke={20}
                formatValue={(v) => String(v)}
                segments={stats.by_category.map((c) => ({
                  label: c.category,
                  value: c.count,
                  color: CATEGORY_COLOR[c.category] ?? FALLBACK_CATEGORY_COLOR,
                }))}
              />
            </div>
          )}
        </section>
      </div>
      <p style={s.footnote}>{t("stats.footnote")}</p>
    </div>
  );
}
