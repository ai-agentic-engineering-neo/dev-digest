/* StatsTab — Stats design: USED BY · PULL FREQUENCY · ACCEPT RATE (ring) ·
   FINDINGS (30D) tiles, "Agents using this skill" (Open → agent's Skills tab)
   and "Findings by category" (donut, counts). Numbers come from run
   attribution (run_skills), so only runs since it shipped are counted. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, Donut, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { DONUT_GAP, DONUT_SIZE, DONUT_STROKE } from "./constants";
import { categorySegments, toPercent } from "./helpers";
import { s } from "./styles";

function Tile({
  label,
  value,
  unit,
  hint,
  aside,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div style={s.tile} title={hint}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {aside}
      </div>
      <div style={s.tileValue}>
        {value}
        {unit && <span style={s.tileUnit}>{unit}</span>}
      </div>
    </div>
  );
}

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.tiles}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
    );
  }
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const pull = toPercent(data.pull_rate);
  const accept = toPercent(data.accept_rate);
  const total = data.by_category.reduce((n, c) => n + c.count, 0);

  return (
    <div>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")} value={data.agents} unit={t("stats.agentsUnit", { count: data.agents })} />
        <Tile label={t("stats.pull")} hint={t("stats.pullHint")} value={pull ?? "—"} unit={pull != null ? "%" : undefined} />
        <Tile
          label={t("stats.accept")}
          hint={t("stats.acceptHint")}
          value={accept ?? "—"}
          unit={accept != null ? "%" : undefined}
          aside={accept != null ? <CircularScore score={accept} size={40} /> : undefined}
        />
        <Tile label={t("stats.findings")} value={data.findings_30d} />
      </div>

      <div style={s.row}>
        <section style={s.panel} aria-label={t("stats.agentsUsing")}>
          <div style={s.panelTitle}>
            <Icon.Cpu size={14} />
            {t("stats.agentsUsing")}
          </div>
          {data.used_by.length === 0 ? (
            <p style={s.empty}>{t("stats.noAgents")}</p>
          ) : (
            data.used_by.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <Icon.Cpu size={14} style={s.agentIcon} />
                <span style={s.agentName}>{a.name}</span>
                <Link href={`/agents/${a.id}?tab=skills`} style={s.open}>
                  {t("stats.open")}
                </Link>
              </div>
            ))
          )}
        </section>
        <section style={s.panel} aria-label={t("stats.byCategory")}>
          <div style={s.panelTitle}>
            <Icon.Tag size={14} />
            {t("stats.byCategory")}
          </div>
          {total === 0 ? (
            <p style={s.empty}>{t("stats.noFindings", { days: data.window_days })}</p>
          ) : (
            <Donut
              segments={categorySegments(data.by_category)}
              size={DONUT_SIZE}
              stroke={DONUT_STROKE}
              gap={DONUT_GAP}
              formatValue={(v) => t("stats.categoryValue", { count: v, pct: `${Math.round((v / total) * 100)}%` })}
            />
          )}
        </section>
      </div>
      <p style={s.windowNote}>{t("stats.window", { days: data.window_days, runs: data.runs_30d })}</p>
    </div>
  );
}
