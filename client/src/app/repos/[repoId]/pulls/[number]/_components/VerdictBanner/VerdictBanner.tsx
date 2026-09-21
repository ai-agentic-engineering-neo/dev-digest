/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore, RunCostBadge, formatTokenFlow } from "@devdigest/ui";
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
  costUsd,
  tokensIn,
  tokensOut,
}: {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Cost + token usage of the run behind this review; null when it is unknown. */
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
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
      </div>
      {(score != null || costUsd != null) && (
        <div style={s.scoreCol}>
          {score != null && (
            <>
              <CircularScore score={score} size={52} stroke={5} />
              <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
            </>
          )}
          {costUsd != null && (
            <div style={s.costRow}>
              <Icon.DollarSign size={11} style={{ color: "var(--text-muted)" }} />
              <RunCostBadge usd={costUsd} tokens={formatTokenFlow(tokensIn ?? null, tokensOut ?? null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
