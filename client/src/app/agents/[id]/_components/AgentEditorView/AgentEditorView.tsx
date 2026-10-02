/* Agent Editor screen — left agent list + config editor. Tab state lives in
   ?tab=. Extracted from agents/[id]/page.tsx so the route file stays a thin
   Server Component and this view is testable without a route harness. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { AgentCard } from "../../../_components/AgentCard";
import { AgentEditor } from "../AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { VALID_TABS, DEFAULT_TAB } from "./constants";
import { s } from "./styles";

export function AgentEditorView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const requested = search.get("tab") ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(requested) ? requested : DEFAULT_TAB;

  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Agents", href: "/agents" },
    { label: agent?.name ?? "Agent" },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn’t load this agent"
          body={error instanceof ApiError ? error.message : "The agent could not be loaded."}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        {/* left: agent list */}
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>Agents</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    Add
                  </Button>
                }
                items={[
                  { label: "Create from scratch", icon: "Edit", onClick: () => router.push("/agents") },
                ]}
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
          <div style={s.editorSkeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editorPane}>
            <div style={s.editorHead}>
              <Icon.Cpu size={18} style={s.editorIcon} />
              <h1 style={s.editorTitle}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
              <div style={s.headSpacer}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  Run on a PR…
                </Button>
              </div>
            </div>
            <div style={s.editorBody}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default AgentEditorView;
