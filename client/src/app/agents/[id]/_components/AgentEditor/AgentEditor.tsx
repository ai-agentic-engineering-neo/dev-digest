/* AgentEditor — Config + Skills + Context + Evals + Stats tabs. Later lessons add CI.
   Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "@/components/evals-tab";
import { StatsTab } from "./_components/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? (
          <SkillsTab agentId={agent.id} />
        ) : tab === "context" ? (
          <ContextTab agent={agent} />
        ) : tab === "evals" ? (
          <EvalsTab ownerKind="agent" ownerId={agent.id} />
        ) : tab === "stats" ? (
          <StatsTab agentId={agent.id} />
        ) : (
          <ConfigTab agent={agent} />
        )}
      </div>
    </div>
  );
}
