/* /agents/:id — Agent Editor inside the two-pane Agents screen. Tabs: Config,
   Skills (L02), and Evals / Stats / CI mount points for later lessons. Tab
   state lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AgentsWorkspace } from "../_components/AgentsWorkspace";
import { AgentEditor, TAB_KEYS } from "./_components/AgentEditor";
import { useAgent } from "../../../lib/hooks/agents";
import { ApiError } from "../../../lib/api";
import { s } from "./styles";

export default function AgentEditorPage() {
  const t = useTranslations("agents");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);

  const tab = TAB_KEYS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  return (
    <AgentsWorkspace activeId={id} activeName={agent?.name} tab={tab}>
      {isError || (!isLoading && !agent) ? (
        <ErrorState
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      ) : isLoading || !agent ? (
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      ) : (
        <>
          <div style={s.header}>
            <Icon.Cpu size={20} style={s.headerIcon} />
            <h1 style={s.h1}>{agent.name}</h1>
            {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
            <div style={s.headerRight}>
              <Dropdown
                width={240}
                align="right"
                trigger={
                  <Button kind="secondary" size="sm" icon="Sparkles" iconRight="ChevronDown">
                    {t("editor.runReview")}
                  </Button>
                }
                items={[{ label: t("editor.runOnPr"), icon: "GitPullRequest", onClick: () => router.push("/") }]}
              />
            </div>
          </div>
          <div style={s.body}>
            <AgentEditor agent={agent} tab={tab} onTab={setTab} />
          </div>
        </>
      )}
    </AgentsWorkspace>
  );
}
