/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore, SEV } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers,
  agentName,
  run,
  severityCounts,
  activeSeverity = null,
  onSeverityClick,
}: {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Cost/token usage of the run that produced this review (Run Cost Badge).
      Omit to hide the line; null shows "—" (run known, data missing). */
  run?: { cost_usd: number | null; tokens_in: number | null; tokens_out: number | null } | null;
  /** Per-severity tally for this run's findings, e.g. `[["CRITICAL", 2], ["WARNING", 1]]`
   *  (see `FindingsPanel/helpers.ts#severityCounts`). Renders a clickable
   *  "N CRITICAL · N WARNING · N SUGGESTION" row when non-empty; omit to hide it. */
  severityCounts?: Array<[string, number]>;
  /** Currently-filtered severity, for the pressed/muted pill styling. */
  activeSeverity?: string | null;
  /** Click a pill to filter to that severity; click the active one again to clear. */
  onSeverityClick?: (severity: string) => void;
}) {
  const t = useTranslations("prReview");
  const m = VERDICT_META[verdict] ?? VERDICT_META.comment;
  const VIcon = Icon[m.icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox(m.bg, m.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
          <Badge color="var(--text-secondary)">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
        {severityCounts && severityCounts.length > 0 && (
          <div style={s.severityRow} role="group" aria-label={t("panel.severityCounters")}>
            {severityCounts.map(([sev, count], i) => (
              <React.Fragment key={sev}>
                {i > 0 && <span style={s.severityDot}>·</span>}
                <button
                  type="button"
                  aria-pressed={activeSeverity === sev}
                  title={
                    activeSeverity === sev
                      ? t("panel.showAllSeverities")
                      : t("panel.showOnlySeverity", { severity: sev })
                  }
                  onClick={() => onSeverityClick?.(sev)}
                  style={s.severityPill(
                    SEV[sev as keyof typeof SEV]?.c ?? "var(--text-secondary)",
                    activeSeverity === sev,
                    activeSeverity != null && activeSeverity !== sev,
                  )}
                >
                  {count} {sev}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
        {run !== undefined && (
          <div style={{ marginTop: 6 }}>
            <RunCostBadge
              variant="withTokens"
              cost={run?.cost_usd ?? null}
              tokens={(run?.tokens_in ?? 0) + (run?.tokens_out ?? 0)}
            />
          </div>
        )}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
        </div>
      )}
    </div>
  );
}
