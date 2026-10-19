/* AgentEditor — tabbed agent editor: Config, Skills (L02), and mount points for
   Evals / Stats / CI (later lessons). Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }));
  const mount = TABS.find((tb) => tb.key === tab)?.mountOwner;
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 20px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? (
          // key: fresh local rows per agent — never save one agent's rows onto another.
          <SkillsTab key={agent.id} agent={agent} />
        ) : mount ? (
          <EmptyState icon="Layers" title={t(`editor.tabs.${tab}`)} body={t("mount.body", { owner: mount })} />
        ) : (
          <ConfigTab agent={agent} />
        )}
      </div>
    </div>
  );
}
