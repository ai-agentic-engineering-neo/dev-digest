/* /agents/:id — Agent Editor (A2, L03). Master-detail: the Agents column on
   the left (Add Agent, search, one AgentCard per agent) and the Config /
   Skills / Context editor on the right. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { AgentCard } from "../_components/AgentCard";
import { CreateAgentModal } from "../_components/CreateAgentModal";
import { AgentEditor } from "./_components/AgentEditor";
import { TEMPLATES } from "../constants";
import { filterAgents } from "../helpers";
import { s } from "./styles";

const VALID_TABS = ["config", "skills", "context"];

export default function AgentEditorPage() {
  const t = useTranslations("agents");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };
  const list = filterAgents(agents ?? [], query);

  const crumb = [{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb"), href: "/agents" }, { label: agent?.name ?? t("editor.agentFallback") }];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("editor.loadErrorTitle")} body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <aside style={s.column} aria-label={t("editor.listTitle")}>
          <div style={s.columnHead}>
            <h1 style={s.h1}>{t("editor.listTitle")}</h1>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("list.addAgent")}
                </Button>
              }
              items={[
                { label: t("editor.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
                { divider: true },
                ...TEMPLATES.map((tp) => ({ label: tp, icon: "Cpu" as const, muted: true, onClick: () => setCreating(true) })),
              ]}
            />
          </div>
          <div style={s.searchWrap}>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("list.searchPlaceholder")} aria-label={t("list.searchPlaceholder")} style={s.searchInput} />
            </div>
          </div>
          <div style={s.list}>
            {list.map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === id}
                skillCount={a.skill_count}
                onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </aside>

        {isLoading || !agent ? (
          <div style={s.skeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <section style={s.pane} data-testid="agent-editor" aria-label={agent.name}>
            <header style={s.header}>
              <span style={s.chip} aria-hidden>
                <Icon.Cpu size={16} />
              </span>
              <h1 style={s.name}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={s.headerRight}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </header>
            <div style={s.body}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
