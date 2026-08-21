"use client";

import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared/contracts/eval-ci";
import { formatMetricPct } from "@/lib/eval-format";
import { s } from "./styles";

/**
 * AC-37/D13 — recall, precision, citation accuracy and cases-passed-of-total
 * from the LATEST COMPLETED run. `run` is null when this agent's cases have
 * never been run (AC-47) — every tile then reads "n/a", never a fake 0. The
 * fourth tile is a COUNT (`passed/total`), not a ratio.
 */
export function MetricTiles({ run }: { run: EvalRunRecord | null }) {
  const t = useTranslations("eval");
  const na = t("notApplicable");
  const metrics = run?.metrics ?? null;

  return (
    <div style={s.tiles} role="group" aria-label={t("evalsTab.metricsTitle")}>
      <MetricCard label={t("dashboard.metrics.recall")} value={formatMetricPct(metrics?.recall, na)} />
      <MetricCard label={t("dashboard.metrics.precision")} value={formatMetricPct(metrics?.precision, na)} />
      <MetricCard
        label={t("dashboard.metrics.citationAccuracy")}
        value={formatMetricPct(metrics?.citation_accuracy, na)}
      />
      <MetricCard
        label={t("evalsTab.casesPassed")}
        value={metrics ? `${metrics.traces_passed}/${metrics.traces_total}` : na}
      />
    </div>
  );
}
