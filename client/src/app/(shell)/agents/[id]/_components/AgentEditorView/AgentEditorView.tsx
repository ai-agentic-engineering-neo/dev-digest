/* Agent Editor View: sidebar + editor tabs. Tab state lives in ?tab=.
   Ported from /agents/[id]/page.tsx. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { ShellCrumb } from "@/components/app-shell";
import { AgentCard } from "../../../_components/AgentCard";
import { AgentEditor } from "../AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/api/agents";
import { ApiError } from "@/lib/api/client";
import { s } from "./styles";

const VALID_TABS = ["config", "skills"];

export function AgentEditorView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("agents");
  const { id } = params;

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Agents", href: "/agents" },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <ShellCrumb items={crumb} />
      <div style={s.container}>
        {/* left: agent list */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarHeaderTop}>
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
                onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {isLoading || !agent ? (
          <div style={s.editorSkeletonContainer}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editorWrapper}>
            <div style={s.editorHeader}>
              <Icon.Cpu size={18} style={s.editorHeaderIcon} />
              <h1 style={s.editorTitle}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={s.editorHeaderSpacer}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={s.editorContent}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
