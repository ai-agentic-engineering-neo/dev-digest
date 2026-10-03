/* SkillDetail — Config + Context + Preview + Evals + Stats + Versions tab shell.
   Mirrors AgentEditor.tsx exactly. Tab state lives in ?tab= (owned by the
   page). The page-level top bar (icon/name/type/version badges + "Run on
   evals") lives in page.tsx, mirroring AgentEditorPage/AgentEditor's split. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { EvalsTab } from "@/components/evals-tab";
import { ConfigTab } from "../ConfigTab";
import { ContextTab } from "../ContextTab";
import { PreviewTab } from "../PreviewTab";
import { StatsTab } from "../StatsTab";
import { VersionsTab } from "../VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "context" ? (
          <ContextTab skill={skill} />
        ) : tab === "preview" ? (
          <PreviewTab skill={skill} />
        ) : tab === "evals" ? (
          <EvalsTab ownerKind="skill" ownerId={skill.id} />
        ) : tab === "stats" ? (
          <StatsTab skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : (
          <ConfigTab skill={skill} />
        )}
      </div>
    </div>
  );
}
