/* StatsTab — last-30-days usage of one skill (GET /skills/:id/stats): pull
   rate · accept rate · findings, findings by category and severity, and the
   agents that link it. Empty state until the skill was part of a run. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarRow, EmptyState, ErrorState, Icon, MetricCard, SEV, SectionLabel, Skeleton, type Severity } from "@devdigest/ui";
import type { CountBy } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks";
import { formatRate } from "@/app/skills/helpers";
import { maxCount, neverAttached } from "./helpers";
import { s } from "./styles";

function Breakdown({ rows, colorOf }: { rows: CountBy[]; colorOf?: (key: string) => string | undefined }) {
  const t = useTranslations("skills");
  if (rows.length === 0) return <p style={s.muted}>{t("stats.none")}</p>;
  const max = maxCount(rows);
  return (
    <div>
      {rows.map((r) => (
        <BarRow key={r.key} label={r.key} value={r.count} max={max} suffix={String(r.count)} color={colorOf?.(r.key)} />
      ))}
    </div>
  );
}

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={200} />;
  if (isError || !stats) return <ErrorState title={t("stats.loadError")} onRetry={() => refetch()} />;
  if (neverAttached(stats.runs_attached)) {
    return <EmptyState icon="BarChart" title={t("stats.empty.title")} body={t("stats.empty.body")} />;
  }

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("stats.title", { days: stats.window_days })}</h2>
      <div style={s.cards}>
        <div style={s.card}>
          <MetricCard label={t("stats.pullRate")} value={formatRate(stats.pull_rate) ?? "—"} />
          <p style={s.hint}>{t("stats.pullRateHint", { cited: stats.runs_cited, attached: stats.runs_attached })}</p>
        </div>
        <div style={s.card}>
          <MetricCard label={t("stats.acceptRate")} value={formatRate(stats.accept_rate) ?? "—"} />
          <p style={s.hint}>{t("stats.acceptRateHint", { accepted: stats.accepted, dismissed: stats.dismissed })}</p>
        </div>
        <div style={s.card}>
          <MetricCard label={t("stats.findings")} value={stats.findings} />
        </div>
      </div>

      <section style={s.section}>
        <SectionLabel icon="Tag">{t("stats.byCategory")}</SectionLabel>
        <Breakdown rows={stats.by_category} />
      </section>
      <section style={s.section}>
        <SectionLabel icon="AlertTriangle">{t("stats.bySeverity")}</SectionLabel>
        <Breakdown rows={stats.by_severity} colorOf={(key) => SEV[key as Severity]?.c} />
      </section>
      <section style={s.section}>
        <SectionLabel icon="Cpu">{t("stats.usedBy")}</SectionLabel>
        {stats.used_by.length === 0 ? (
          <p style={s.muted}>{t("stats.notUsed")}</p>
        ) : (
          <ul style={s.agents}>
            {stats.used_by.map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${encodeURIComponent(a.id)}?tab=skills`} style={s.agent(a.enabled)}>
                  <Icon.Cpu size={13} />
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
