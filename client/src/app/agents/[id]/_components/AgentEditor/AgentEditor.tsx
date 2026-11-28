/* AgentEditor — agent config editor (model + system prompt) and the Skills tab
   (M2: linked skills, their per-link flag and prompt order). Evals/Stats/CI
   arrive later. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { TABS, type AgentTab } from "../../constants";
import { parseAgentTab } from "../../helpers";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: AgentTab; onTab: (t: AgentTab) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(parseAgentTab(k))} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? <SkillsTab key={agent.id} agentId={agent.id} /> : <ConfigTab key={agent.id} agent={agent} />}
      </div>
    </div>
  );
}
