/* SkillEditor — Config/Preview/Versions tabs. Tab state lives in ?tab= on the
   parent (SkillsView). Mirrors agents/[id]/_components/AgentEditor/AgentEditor.tsx. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Remount ConfigTab on skill switch instead of an effect-driven state
            reset inside it — see ConfigTab.tsx. */}
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skillId={skill.id} currentVersion={skill.version} />}
      </div>
    </div>
  );
}
