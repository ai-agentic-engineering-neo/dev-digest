"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  multiAgentHref,
  parseMultiAgentSearch,
  type MultiAgentUrlState,
  type MultiAgentViewMode,
} from "@/lib/multi-agent-url";
import { toSelectedAgents } from "../../helpers";
import type { ResolvedPr } from "../../types";
import { RunConfig } from "../RunConfig";
import { MultiAgentResults } from "../MultiAgentResults";
import { useMultiAgentRun } from "./hooks/useMultiAgentRun";
import { s } from "./styles";

export function MultiAgentView({ repoId }: { repoId: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const url = parseMultiAgentSearch(useSearchParams());
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: agents, isLoading: agentsLoading, isError: agentsError, refetch: refetchAgents } = useAgents();
  const { data: pulls, isLoading: pullsLoading, isError: pullsError, refetch: refetchPulls } = usePulls(repoId);

  const selected = toSelectedAgents(agents ?? [], url.agents);
  const selectedIds = selected.map((a) => a.id);
  const found = pulls?.find((p) => p.number === url.pr);
  const pr: ResolvedPr | null =
    found && found.id ? { id: found.id, number: found.number, title: found.title } : null;

  const { startStates, start, isStarting } = useMultiAgentRun(pr?.id ?? null);

  const hrefWith = (patch: Partial<MultiAgentUrlState>) => multiAgentHref(repoId, { ...url, ...patch });
  const replace = (patch: Partial<MultiAgentUrlState>) => router.replace(hrefWith(patch));
  const push = (patch: Partial<MultiAgentUrlState>) => router.push(hrefWith(patch));

  const handleRun = () => {
    if (!pr || selectedIds.length === 0) return;
    push({ agents: selectedIds, phase: "results" });
    void start(selectedIds);
  };

  const crumb = [
    { label: activeRepo?.full_name ?? repoId, mono: true, href: `/repos/${encodeURIComponent(repoId)}/pulls` },
    { label: t("page.crumb") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.root}>
        {/* A results URL opened directly (reload / shared link) resolves its PR from the pulls list and
            its columns from the agents list: show loading/error explicitly instead of flashing the config
            screen or the "no run yet" state. Only a PR really missing from the loaded list falls back to config. */}
        {url.phase === "results" && (pullsLoading || agentsLoading) ? (
          <Skeleton height={160} />
        ) : url.phase === "results" && pullsError ? (
          <ErrorState
            title={t("page.pullsError.title")}
            body={t("page.pullsError.body")}
            onRetry={() => void refetchPulls()}
          />
        ) : url.phase === "results" && agentsError ? (
          <ErrorState
            title={t("config.agentsError.title")}
            body={t("config.agentsError.body")}
            onRetry={() => void refetchAgents()}
          />
        ) : url.phase === "results" && pr ? (
          <MultiAgentResults
            pr={pr}
            agents={selected}
            view={url.view}
            startStates={startStates}
            onRetry={(agentId) => void start([agentId])}
            onConfigure={() => push({ agents: selectedIds, phase: "config" })}
            onChangeView={(view: MultiAgentViewMode) => replace({ view })}
          />
        ) : (
          <RunConfig
            repoId={repoId}
            prNumber={url.pr}
            selectedIds={selectedIds}
            onSelectPr={(prNumber) => replace({ pr: prNumber })}
            onChangeAgents={(ids) => replace({ agents: ids })}
            onRun={handleRun}
            isStarting={isStarting}
          />
        )}
      </div>
    </AppShell>
  );
}

export default MultiAgentView;
