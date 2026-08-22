/* MultiAgentConfigureView — /repos/:repoId/multi-agent (Screens A/B). Reads
   `?pr=<prId>` so every D26 entrance (the nav item, the results surface's
   "start new review", the PR-page picker's "Configure agents…") can
   deep-link with a PR preselected. Zero LLM calls anywhere on this flow
   (AC-8) — every request here is a plain read; the trigger itself is a
   single POST, fired only on explicit Run. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, SelectInput, EmptyState, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { usePulls } from "@/lib/hooks/core";
import { useAgents } from "@/lib/hooks/agents";
import { useMultiAgentRun, useAgentRunEstimates, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";
import { ApiError } from "@/lib/api";
// D21 — the SAME derived-identity helper the results surface uses (no
// per-agent colour/icon schema field, N14); do not duplicate the palette.
import { agentIdentity } from "@/app/repos/[repoId]/multi-agent/[prId]/_components/MultiAgentResultsView/helpers";
import { aggregateEstimate } from "./helpers";
import { s } from "./styles";

export function MultiAgentConfigureView() {
  const { repoId } = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("runs");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const prFromQuery = search.get("pr");
  const [selectedPrId, setSelectedPrId] = React.useState<string | null>(prFromQuery);
  React.useEffect(() => {
    if (prFromQuery && prFromQuery !== selectedPrId) setSelectedPrId(prFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prFromQuery]);

  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: estimates } = useAgentRunEstimates();
  // AC-66/D26 — surface (never auto-navigate to) an existing run for this PR.
  // A 404 just means "no run yet"; `retry: false` keeps that settling fast.
  const { data: existingRun } = useMultiAgentRun(selectedPrId);

  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    setSelectedAgentIds([]);
  }, [selectedPrId]);

  const startRun = useStartMultiAgentRun();

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("page.crumb") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const all = agents ?? [];
  const toggleAgent = (id: string) =>
    setSelectedAgentIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allSelected = all.length > 0 && selectedAgentIds.length === all.length;
  const toggleSelectAll = () => setSelectedAgentIds(allSelected ? [] : all.map((a) => a.id));

  const aggregate = aggregateEstimate(selectedAgentIds, estimates ?? []);

  const canRun = !!selectedPrId && selectedAgentIds.length > 0 && !startRun.isPending;
  const handleRun = () => {
    if (!selectedPrId) return;
    startRun.mutate(
      { prId: selectedPrId, agentIds: selectedAgentIds },
      {
        onSuccess: (data) => router.push(`/repos/${repoId}/multi-agent/${data.pr_id}`),
      },
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>{t("page.title")}</h1>
        <div style={s.pageSubtitle}>{t("page.subtitle")}</div>
      </div>

      <div style={s.body}>
        <div>
          <div style={s.fieldLabel}>{t("page.selectPr")}</div>
          <SelectInput
            value={selectedPrId ?? ""}
            onChange={(v) => setSelectedPrId(v || null)}
            options={[
              { value: "", label: t("page.selectPr") },
              ...(pulls ?? []).map((p) => ({
                value: p.id ?? "",
                label: t("page.prItem", { number: p.number, title: p.title }),
              })),
            ]}
          />
        </div>

        {!selectedPrId && !pullsLoading && (
          <EmptyState icon="Users" title={t("page.pickPrFirst")} />
        )}

        {selectedPrId && (
          <>
            {/* AC-66/D26 — a prominent PRIMARY affordance ahead of the
                configure path, never an auto-redirect (browser Back must
                still leave this page). */}
            {existingRun && (
              <div style={s.resumeCard}>
                <Icon.CheckCircle size={18} style={{ color: "var(--accent)" }} />
                <Button
                  kind="primary"
                  icon="ArrowRight"
                  onClick={() => router.push(`/repos/${repoId}/multi-agent/${selectedPrId}`)}
                >
                  {t("page.viewExistingResults")}
                </Button>
              </div>
            )}

            {!agentsLoading && all.length === 0 ? (
              <EmptyState
                icon="Cpu"
                title={t("page.noAgents.title")}
                body={t("page.noAgents.body")}
                cta={t("page.noAgents.cta")}
                onCta={() => router.push("/agents")}
              />
            ) : (
              <div>
                <div style={s.agentListHeader}>
                  <div style={s.fieldLabel}>{t("page.configureRun")}</div>
                  <Button kind="ghost" size="sm" onClick={toggleSelectAll}>
                    {t("page.selectAll")}
                  </Button>
                </div>

                {all.map((a) => {
                  const identity = agentIdentity(a.id);
                  const est = (estimates ?? []).find((e) => e.agent_id === a.id);
                  const hasEstimate = est?.avg_duration_ms != null && est?.avg_cost_usd != null;
                  return (
                    <div key={a.id} style={s.agentRow}>
                      <Checkbox checked={selectedAgentIds.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                      <span style={s.agentIdentityDot(identity.color)}>
                        <Icon.Cpu size={11} style={{ color: identity.color }} />
                      </span>
                      <span style={s.agentName}>{a.name}</span>
                      <span style={s.agentEstimate}>
                        {hasEstimate
                          ? t("page.estimate.perAgent", {
                              duration: (est!.avg_duration_ms! / 1000).toFixed(1),
                              cost: formatCost(est!.avg_cost_usd),
                            })
                          : t("page.estimate.unavailable")}
                      </span>
                    </div>
                  );
                })}

                <div style={s.aggregateRow}>
                  <span>{t("page.selectedCount", { count: selectedAgentIds.length, total: all.length })}</span>
                  <span>
                    {aggregate.durationMs != null
                      ? t("page.estimate.aggregate", {
                          duration: (aggregate.durationMs / 1000).toFixed(1),
                          cost: formatCost(aggregate.costUsd),
                        })
                      : t("page.estimate.unavailable")}
                  </span>
                </div>

                <div style={s.runRow}>
                  <Button kind="primary" icon="Play" disabled={!canRun} loading={startRun.isPending} onClick={handleRun}>
                    {t("page.runSelected", { count: selectedAgentIds.length })}
                  </Button>
                </div>

                {startRun.isError && (
                  <div role="alert">
                    {startRun.error instanceof ApiError ? startRun.error.message : t("page.allFailed")}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
