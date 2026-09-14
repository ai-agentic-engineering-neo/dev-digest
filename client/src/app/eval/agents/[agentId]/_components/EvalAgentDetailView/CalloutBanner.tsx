"use client";

import { useTranslations } from "next-intl";
import type { EvalCallout } from "@devdigest/shared/contracts/eval-ci";
import { s } from "./styles";

const METRIC_KEY: Record<EvalCallout["metric"], string> = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citationAccuracy",
};

/**
 * D12/AC-45 — a structured callout, rendered from `messages/en/eval.json`
 * (never model-authored prose, N1). The causal clause naming the cases that
 * flipped pass/fail is emitted ONLY when `case_transitions` is non-empty —
 * that branch lives here, not on the server, but the DATA that drives it
 * (whether the array is empty) is the server's.
 */
export function CalloutBanner({ callout }: { callout: EvalCallout }) {
  const t = useTranslations("eval");
  const metric = t(`callout.metric.${METRIC_KEY[callout.metric]}`);
  const direction = t(`callout.direction.${callout.direction}`);
  const magnitude = Math.round(callout.magnitude * 100);
  const version = callout.agent_version ?? "—";

  if (callout.case_transitions.length === 0) {
    return (
      <p style={s.callout}>
        {t("callout.withoutTransitions", { metric, direction, magnitude, version })}
      </p>
    );
  }

  const cases = callout.case_transitions.map((c) => c.name).join(", ");
  return (
    <p style={s.callout}>
      {t("callout.withTransitions", { metric, direction, magnitude, version, cases })}
    </p>
  );
}
