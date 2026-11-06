"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import type { MultiAgentViewMode } from "@/lib/multi-agent-url";
import { formatSeconds } from "../../../../helpers";
import type { ResolvedPr, RunTotals } from "../../../../types";
import { s } from "./styles";

export interface ResultsHeaderProps {
  pr: ResolvedPr;
  totals: RunTotals;
  view: MultiAgentViewMode;
  onChangeView: (v: MultiAgentViewMode) => void;
  onConfigure: () => void;
}

const VIEWS: readonly MultiAgentViewMode[] = ["columns", "tabs"];

export function ResultsHeader({ pr, totals, view, onChangeView, onConfigure }: ResultsHeaderProps) {
  const t = useTranslations("runs");

  return (
    <div style={s.root}>
      <div style={s.top}>
        <div style={s.titleBlock}>
          <h1 style={s.title}>{t("page.title")}</h1>
          <p style={s.subtitle}>{t("results.subtitle", { count: totals.agent_count })}</p>
        </div>
        <div style={s.actions}>
          <div role="group" aria-label={t("page.view.label")} style={s.toggle}>
            {VIEWS.map((v) => (
              <Button
                key={v}
                kind="tertiary"
                active={view === v}
                aria-pressed={view === v}
                onClick={() => onChangeView(v)}
              >
                {t(`page.view.${v}`)}
              </Button>
            ))}
          </div>
          <Button onClick={onConfigure}>{t("results.configure")}</Button>
        </div>
      </div>
      <div style={s.meta}>
        <span style={s.prNumber}>#{pr.number}</span>
        <span style={s.prTitle}>{pr.title}</span>
        <span>
          {totals.wall_ms == null
            ? t("page.metaRunning", { count: totals.agent_count })
            : t("page.meta", { count: totals.agent_count, duration: formatSeconds(totals.wall_ms) })}
        </span>
        <RunCostBadge variant="compact" costUsd={totals.cost_usd} />
      </div>
    </div>
  );
}
