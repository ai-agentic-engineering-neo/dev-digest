/* SkillEditor — tabbed skill editor: Config, Preview, Stats, Versions, and an
   Evals mount point (L06). Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }));
  const mount = TABS.find((tb) => tb.key === tab)?.mountOwner;
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 20px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab skill={skill} />
        ) : tab === "stats" ? (
          <StatsTab skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : mount ? (
          <EmptyState icon="FlaskConical" title={t(`editor.tabs.${tab}`)} body={t("editor.mountBody", { owner: mount })} />
        ) : (
          // key: fresh local draft per skill — never save one skill's draft onto another.
          <ConfigTab key={skill.id} skill={skill} />
        )}
      </div>
    </div>
  );
}
