/* SkillEditor — 4-tab skill editor (Config / Preview / Stats / Versions).
   Tab state lives in ?tab= (owned by the page). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillConfigTab } from "./_components/SkillConfigTab";
import { SkillPreviewTab } from "./_components/SkillPreviewTab";
import { SkillStatsTab } from "./_components/SkillStatsTab";
import { SkillVersionsTab } from "./_components/SkillVersionsTab";
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
        {tab === "config" && <SkillConfigTab skill={skill} />}
        {tab === "preview" && <SkillPreviewTab skill={skill} />}
        {tab === "stats" && <SkillStatsTab skillId={skill.id} />}
        {tab === "versions" && <SkillVersionsTab skillId={skill.id} />}
      </div>
    </div>
  );
}
