/* AgentEditor — tabbed agent editor: Config (model + system prompt) and
   Skills (attach + order workspace skills). Evals/Stats/CI come later.
   Tab state lives in ?tab= (validated against VALID_TABS by the view). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
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
        {/* key: switching agents remounts the tab, which resets its local state. */}
        {tab === "skills" ? <SkillsTab key={agent.id} agentId={agent.id} /> : <ConfigTab key={agent.id} agent={agent} />}
      </div>
    </div>
  );
}
