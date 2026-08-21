"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { AgentSummaryRow } from "./AgentSummaryRow";
import { RecentRunsTable } from "./RecentRunsTable";
import { RunAllModal } from "./RunAllModal";
import { s } from "./styles";

/**
 * /eval — AC-40 … AC-45: every agent's latest metrics + trend, a combined
 * recent-runs table, the "per-agent case set" statement (AC-43) and the
 * run-all action with its confirmation dialog (AC-25/AC-42). Workspace-
 * scoped, NOT repo-scoped (AC-40) — modelled on `app/skills/page.tsx`, not
 * the `/repos/:repoId/...` template.
 */
export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const [runAllOpen, setRunAllOpen] = React.useState(false);

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("dashboard.defaultTitle") }];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("dashboard.loading")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {runAllOpen && data && <RunAllModal agents={data.agents} onClose={() => setRunAllOpen(false)} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.subtitle}>{t("dashboard.perAgentNote")}</p>
          </div>
          <Button kind="secondary" icon="Play" onClick={() => setRunAllOpen(true)} disabled={isLoading}>
            {t("run.confirmAll.trigger")}
          </Button>
        </div>

        {isLoading && (
          <div style={s.agentList}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        )}

        {!isLoading && data && (
          <>
            <div style={s.section}>
              {data.agents.length === 0 ? (
                <EmptyState icon="BarChart3" title={t("dashboard.defaultTitle")} body={t("empty.noCases")} />
              ) : (
                <div style={s.agentList}>
                  {data.agents.map((a) => (
                    <AgentSummaryRow key={a.agent_id} agent={a} />
                  ))}
                </div>
              )}
            </div>

            <div style={s.section}>
              <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
              <RecentRunsTable runs={data.recent_runs} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
