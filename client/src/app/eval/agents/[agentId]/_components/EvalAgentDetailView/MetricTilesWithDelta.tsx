"use client";

import { useTranslations } from "next-intl";
import type { EvalAgentDetail } from "@devdigest/shared/contracts/eval-ci";
import { formatMetricDeltaPct, formatMetricPct } from "@/lib/eval-format";
import { s } from "./styles";

/** AC-44 — metric tiles with deltas against the previous completed run.
 *  `delta` is null when fewer than two completed runs exist (AC-48) — every
 *  tile then omits the delta line instead of showing a fake +0.0pp. */
export function MetricTilesWithDelta({
  current,
  delta,
}: {
  current: EvalAgentDetail["current"];
  delta: EvalAgentDetail["delta"];
}) {
  const t = useTranslations("eval");
  const na = t("notApplicable");

  return (
    <div style={s.tiles}>
      <Tile
        label={t("dashboard.metrics.recall")}
        value={formatMetricPct(current?.recall, na)}
        delta={delta ? formatMetricDeltaPct(delta.recall, na) : null}
      />
      <Tile
        label={t("dashboard.metrics.precision")}
        value={formatMetricPct(current?.precision, na)}
        delta={delta ? formatMetricDeltaPct(delta.precision, na) : null}
      />
      <Tile
        label={t("dashboard.metrics.citationAccuracy")}
        value={formatMetricPct(current?.citation_accuracy, na)}
        delta={delta ? formatMetricDeltaPct(delta.citation_accuracy, na) : null}
      />
      <Tile
        label={t("evalsTab.casesPassed")}
        value={current ? `${current.traces_passed}/${current.traces_total}` : na}
        delta={null}
      />
    </div>
  );
}

function Tile({ label, value, delta }: { label: string; value: string; delta: string | null }) {
  const up = delta?.startsWith("+");
  const down = delta?.startsWith("-");
  const color = up ? "var(--ok, var(--text-secondary))" : down ? "var(--crit)" : "var(--text-muted)";
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValue}>{value}</div>
      {delta && <div style={s.tileDelta(color)}>{delta}</div>}
    </div>
  );
}
