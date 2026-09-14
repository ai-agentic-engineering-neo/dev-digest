/* Stats tab — four tiles, the agents panel, and the findings ring.

   Two rules that must not be broken here:
   1. `null` renders "—" and a measured `0` renders "0". Unmeasured and
      measured-zero are different facts; a fresh workspace must not look like a
      failing one.
   2. The ring's legend shows COUNTS. The mockup's "security $52.00" is a count
      run through a money formatter — `formatCost` is for money and money is not
      what this measures. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { categorySegments, metricValue, percentValue, type CategorySegment } from "./helpers";
import { s } from "./styles";

const RING_SIZE = 130;
const RING_STROKE = 22;

/**
 * Local ring instead of `@devdigest/ui`'s `Donut`: that component hard-codes a
 * `$` prefix and `value.toFixed(2)` in its legend, so it cannot render integer
 * counts — and widening it would mean editing vendored UI source.
 */
function CategoryRing({ segments }: { segments: CategorySegment[] }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={RING_SIZE} height={RING_SIZE} style={{ flexShrink: 0 }} aria-hidden>
      <g transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}>
        {segments.map((seg) => {
          const dash = seg.fraction * circumference;
          const el = (
            <circle
              key={seg.category}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={RING_STROKE}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) return <Skeleton height={300} />;
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const segments = categorySegments(data.by_category);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard label={t("stats.usedBy")} value={metricValue(data.used_by)} />
        <MetricCard label={t("stats.pullFrequency")} value={percentValue(data.pull_pct)} />

        {/* ACCEPT RATE carries the ring gauge from the design. With nothing
            judged yet there is no score to draw — "—" beats a 0% ring. */}
        <div style={s.acceptTile}>
          {data.accept_pct != null && <CircularScore score={Math.round(data.accept_pct)} size={46} />}
          <div style={s.acceptText}>
            <div style={s.tileLabel}>{t("stats.acceptRate")}</div>
            <div className="tnum" style={s.tileValue}>
              {percentValue(data.accept_pct)}
            </div>
          </div>
        </div>

        <MetricCard label={t("stats.findings30d")} value={metricValue(data.findings_30d)} />
      </div>

      <div style={s.panels}>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.agentsTitle")}</div>
          {data.agents.length === 0 ? (
            <div style={s.empty}>{t("stats.agentsEmpty")}</div>
          ) : (
            data.agents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <span style={s.agentName}>{a.name}</span>
                {/* Straight to the tab where this link can be toggled. */}
                <Link href={`/agents/${a.id}?tab=skills`} style={s.agentLink}>
                  {t("stats.open")}
                </Link>
              </div>
            ))
          )}
          {data.avg_tokens != null && (
            <div style={s.panelHint}>{t("stats.avgTokens", { count: data.avg_tokens })}</div>
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.findingsTitle")}</div>
          {segments.length === 0 ? (
            <div style={s.empty}>{t("stats.findingsEmpty")}</div>
          ) : (
            <div style={s.donutRow}>
              <CategoryRing segments={segments} />
              <div style={s.legend}>
                {segments.map((seg) => (
                  <div key={seg.category} style={s.legendRow}>
                    <span style={s.legendSwatch(seg.color)} />
                    <span style={s.legendLabel}>{seg.category}</span>
                    <span className="mono tnum" style={s.legendCount}>
                      {seg.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={s.panelHint}>{t("stats.findingsHint")}</div>
        </div>
      </div>
    </div>
  );
}
