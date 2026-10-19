/* AgentsPane — left column: "Agents" + Add Agent ▾, search, agent cards. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useAgents, useUpdateAgent } from "../../../../../../lib/hooks/agents";
import { AgentCard } from "../../../AgentCard";
import { useCreateAgentModal } from "../../AgentsWorkspace";
import { TEMPLATES } from "../../constants";
import { filterAgents } from "../../helpers";
import { s } from "./styles";

export function AgentsPane({ activeId, tab = "config" }: { activeId?: string; tab?: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgentModal();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const [search, setSearch] = React.useState("");
  const list = filterAgents(agents ?? [], search);

  return (
    <>
      <div style={s.head}>
        <h1 style={s.h1}>{t("list.title")}</h1>
        {(agents ?? []).length > 0 && (
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.addAgent")}
              </Button>
            }
            items={[
              { label: t("list.createFromScratch"), icon: "Edit", onClick: () => create.open() },
              { divider: true },
              ...TEMPLATES.map((tp) => ({
                label: t("list.templateName", { template: tp }),
                icon: "Cpu" as const,
                onClick: () => create.open(tp),
              })),
            ]}
          />
        )}
      </div>
      {(agents ?? []).length > 0 && (
        <div style={s.searchWrap}>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
        </div>
      )}
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {(agents ?? []).length > 0 && list.length === 0 && <div style={s.noMatch}>{t("list.noMatch")}</div>}
        {list.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            skillCount={a.skill_count}
            onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
          />
        ))}
      </div>
    </>
  );
}
