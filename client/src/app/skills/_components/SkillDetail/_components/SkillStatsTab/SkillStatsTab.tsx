"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks";
import { formatPercent } from "./helpers";
import { s } from "./styles";
import { StatTile } from "./_components/StatTile";
import { RateRing } from "./_components/RateRing";
import { AgentsCard } from "./_components/AgentsCard";
import { CategoriesCard } from "./_components/CategoriesCard";

export function SkillStatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skillStats");
  const q = useSkillStats(skillId);

  if (q.isError) {
    return (
      <div style={s.root}>
        <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => void q.refetch()} />
      </div>
    );
  }
  if (q.isLoading || !q.data) {
    return (
      <div style={s.root} data-testid="skill-stats-loading">
        <div style={s.tiles}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={88} />)}
        </div>
        <div style={s.cards}>
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  const d = q.data;
  if (d.runs_total === 0) {
    return (
      <div style={s.root}>
        <EmptyState icon="Gauge" title={t("empty.title")} body={t("empty.body", { days: d.window_days })} />
      </div>
    );
  }

  const dash = t("tiles.noValue");
  const pull = formatPercent(d.pull_rate);
  const accept = formatPercent(d.accept_rate);

  return (
    <div style={s.root}>
      <div style={s.tiles}>
        <StatTile label={t("tiles.usedBy")} value={String(d.agents_count)} unit={t("tiles.usedByValue", { count: d.agents_count })} />
        <StatTile label={t("tiles.pullFrequency")} value={pull ?? dash} unit={pull === null ? undefined : "%"} />
        <StatTile
          label={t("tiles.acceptRate")}
          value={accept ?? dash}
          unit={accept === null ? undefined : "%"}
          aside={d.accept_rate === null ? undefined : <RateRing rate={d.accept_rate} />}
        />
        <StatTile label={t("tiles.findings", { days: d.window_days })} value={String(d.findings_total)} />
      </div>
      <div style={s.cards}>
        <AgentsCard agents={d.agents} />
        <CategoriesCard byCategory={d.by_category} />
      </div>
    </div>
  );
}
