/* AgentEditor — agent config + skills editor. Later lessons add Evals/Stats/CI
   tabs; Config and Skills are wired up. Tab state lives in ?tab=. */
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
        {/* `key` remounts the tab on agent switch so its local state
            initializes fresh from the new agent, instead of syncing via an
            effect. */}
        {tab === "config" ? <ConfigTab key={agent.id} agent={agent} /> : <SkillsTab agent={agent} key={agent.id} />}
      </div>
    </div>
  );
}
