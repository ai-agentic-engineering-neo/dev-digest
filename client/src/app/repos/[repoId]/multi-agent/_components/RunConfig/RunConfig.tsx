/* RunConfig — phase "config" of the multi-agent page: pick a PR, pick agents, run. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, type DropdownItemDef } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge";
import { useAgents, useAgentRunEstimates } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { agentColorIndex, aggregateEstimate, formatSeconds } from "../../helpers";
import { MAX_AGENTS_PER_RUN } from "../../constants";
import { AgentPickCard } from "./_components/AgentPickCard";
import { s } from "./styles";

export interface RunConfigProps {
  repoId: string;
  prNumber: number | null;
  selectedIds: readonly string[];
  onSelectPr: (prNumber: number) => void;
  onChangeAgents: (ids: string[]) => void;
  onRun: () => void;
  isStarting: boolean;
}

export function RunConfig({
  repoId,
  prNumber,
  selectedIds,
  onSelectPr,
  onChangeAgents,
  onRun,
  isStarting,
}: RunConfigProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const {
    data: pulls,
    isLoading: pullsLoading,
    isError: pullsError,
    refetch: refetchPulls,
  } = usePulls(repoId);
  const {
    data: agentsData,
    isLoading: agentsLoading,
    isError: agentsError,
    refetch: refetchAgents,
  } = useAgents();
  const { data: estimatesData } = useAgentRunEstimates();
  const agents = agentsData ?? [];
  const estimates = estimatesData ?? [];
  const allIds = agents.map((a) => a.id);

  const selectedPr = pulls?.find((p) => p.number === prNumber);
  const prItems: DropdownItemDef[] = (pulls ?? []).map((p) => ({
    label: t("page.prItem", { number: p.number, title: p.title }),
    onClick: () => onSelectPr(p.number),
  }));

  const selectable = allIds.slice(0, MAX_AGENTS_PER_RUN);
  const allSelected = selectable.length > 0 && selectable.every((id) => selectedIds.includes(id));
  const capReached = selectedIds.length >= MAX_AGENTS_PER_RUN;
  const count = selectedIds.length;
  const total = aggregateEstimate(selectedIds, estimates);

  const toggle = (id: string, checked: boolean) =>
    onChangeAgents(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));

  return (
    <div style={s.root}>
      <header>
        <h1 style={s.title}>{t("config.title")}</h1>
        <p style={s.intro}>{t("config.intro")}</p>
      </header>

      <section style={s.step}>
        <span style={s.stepTitle}>{t("config.stepPr")}</span>
        {pullsError ? (
          <ErrorState
            title={t("page.pullsError.title")}
            body={t("page.pullsError.body")}
            onRetry={() => void refetchPulls()}
          />
        ) : pullsLoading ? (
          <Skeleton height={36} />
        ) : (
          <div>
            <Dropdown
              width={380}
              items={prItems}
              trigger={
                <Button kind="secondary" iconRight="ChevronDown">
                  {selectedPr
                    ? t("page.prItem", { number: selectedPr.number, title: selectedPr.title })
                    : t("page.selectPr")}
                </Button>
              }
            />
          </div>
        )}
      </section>

      <section style={s.step}>
        <div style={s.stepHead}>
          <span style={s.stepTitle}>{t("config.stepAgents")}</span>
          {prNumber !== null && agents.length > 0 && (
            <Button kind="ghost" size="sm" onClick={() => onChangeAgents(allSelected ? [] : selectable)}>
              {allSelected ? t("config.clearAll") : t("config.selectAll")}
            </Button>
          )}
        </div>
        {prNumber === null ? (
          <div style={s.placeholder}>{t("config.pickPrFirst")}</div>
        ) : agentsError ? (
          <ErrorState
            title={t("config.agentsError.title")}
            body={t("config.agentsError.body")}
            onRetry={() => void refetchAgents()}
          />
        ) : agentsLoading ? (
          <Skeleton height={120} />
        ) : agents.length === 0 ? (
          <EmptyState
            icon="Cpu"
            title={t("page.noAgents.title")}
            body={t("page.noAgents.body")}
            cta={t("page.noAgents.cta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <div style={s.grid}>
            {agents.map((a) => {
              const checked = selectedIds.includes(a.id);
              return (
                <AgentPickCard
                  key={a.id}
                  agent={a}
                  colorIndex={agentColorIndex(a.id, allIds)}
                  checked={checked}
                  disabled={capReached && !checked}
                  estimate={estimates.find((e) => e.agent_id === a.id)}
                  onToggle={(on) => toggle(a.id, on)}
                />
              );
            })}
          </div>
        )}
      </section>

      <div style={s.runBar}>
        <Button
          kind="primary"
          icon="Play"
          disabled={prNumber === null || count === 0 || isStarting}
          onClick={onRun}
        >
          {t("config.run", { count })}
        </Button>
        {prNumber !== null && total && (
          <span style={s.total}>
            {t("config.totalEstimate", {
              seconds: formatSeconds(total.duration_ms),
              cost: formatCost(total.cost_usd),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export default RunConfig;
