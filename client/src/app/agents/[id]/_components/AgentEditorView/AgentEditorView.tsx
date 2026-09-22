/* AgentEditorView — /agents/:id screen: left agent list + the editor for the
   selected agent. The active tab comes from ?tab= (resolved by the route). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { AgentCard } from "../../../_components/AgentCard";
import { AgentEditor } from "../AgentEditor";
import { agentHref } from "./helpers";
import { s } from "./styles";

export function AgentEditorView({ id, tab }: { id: string; tab: string }) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const setTab = (next: string) => router.replace(agentHref(id, next));

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()} retryLabel={tc("actions.retry")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("editor.listTitle")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("editor.add")}
                  </Button>
                }
                items={[{ label: t("editor.createFromScratch"), icon: "Edit", onClick: () => router.push("/agents") }]}
              />
            </div>
          </div>
          <div style={s.sidebarList}>
            {(agents ?? []).map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === id}
                onClick={() => router.push(agentHref(a.id, tab))}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !agent ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.mainHeader}>
              <Icon.Cpu size={18} style={s.mainIcon} />
              <h1 style={s.mainTitle}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={s.mainActions}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={s.editorScroll}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
