/* /agents — Agents (A2, L03). The page is master-detail like /skills: the
   agents column and the editor live on /agents/:id, so this view opens the
   first agent (router.replace). It renders the loading, error and empty
   states itself; the empty state offers the create modal. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { CreateAgentModal } from "../CreateAgentModal";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const [creating, setCreating] = React.useState(false);

  const firstId = agents?.[0]?.id ?? null;
  React.useEffect(() => {
    if (firstId) router.replace(`/agents/${firstId}?tab=config`);
  }, [firstId, router]);

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        {(isLoading || firstId) && (
          <div style={s.skeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && !firstId && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
      </div>
    </AppShell>
  );
}
