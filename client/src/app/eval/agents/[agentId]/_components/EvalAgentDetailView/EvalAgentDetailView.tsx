"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalAgentDetail } from "@/lib/hooks/eval";
import { MetricTilesWithDelta } from "./MetricTilesWithDelta";
import { TrendChart } from "./TrendChart";
import { RunHistoryTable } from "./RunHistoryTable";
import { CompareModal } from "./CompareModal";
import { CalloutBanner } from "./CalloutBanner";
import { s } from "./styles";

/**
 * /eval/agents/:id — AC-44, AC-45, AC-48: one agent's eval detail — metric
 * tiles with deltas, the three-metric trend, the run-history table with
 * two-run selection, the compare modal and the callout. `?compareA=&compareB=`
 * (set by `EvalsTab`'s `RunHistory` "Compare" action) opens the modal
 * immediately with that pair.
 */
export function EvalAgentDetailView() {
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const t = useTranslations("eval");

  const { data, isLoading, isError, refetch } = useEvalAgentDetail(agentId);
  const [comparePair, setComparePair] = React.useState<[string, string] | null>(() => {
    const a = search.get("compareA");
    const b = search.get("compareB");
    return a && b && a !== b ? [a, b] : null;
  });

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("dashboard.defaultTitle"), href: "/eval" },
    { label: data?.agent_name ?? t("page.crumbEvals") },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("dashboard.loading")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {comparePair && (
        <CompareModal a={comparePair[0]} b={comparePair[1]} onClose={() => setComparePair(null)} />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{data?.agent_name ?? t("dashboard.defaultTitle")}</h1>
          <div style={s.headSpacer}>
            <Button kind="ghost" size="sm" onClick={() => router.push("/eval")}>
              {t("dashboard.defaultTitle")}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div style={s.section}>
            <Skeleton height={100} />
            <Skeleton height={200} />
          </div>
        )}

        {!isLoading && data && (
          <>
            {data.callout && <CalloutBanner callout={data.callout} />}

            <MetricTilesWithDelta current={data.current} delta={data.delta} />

            {data.cases_total === 0 ? (
              <p style={s.callout}>{t("empty.noCases")}</p>
            ) : !data.current ? (
              <p style={s.callout}>{t("empty.neverRun")}</p>
            ) : data.runs.filter((r) => r.status === "completed").length === 1 ? (
              <p style={s.callout}>{t("empty.oneRun")}</p>
            ) : null}

            <div style={s.section}>
              <h2 style={s.h2}>{t("dashboard.metricTrend")}</h2>
              <TrendChart trend={data.trend} />
            </div>

            <div style={s.section}>
              <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
              <RunHistoryTable runs={data.runs} onCompare={(a, b) => setComparePair([a, b])} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
