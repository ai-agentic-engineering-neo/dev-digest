/* SkillEditor — header (name, version, enabled) + Config / Preview / Versions tabs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { SKILL_TABS, TAB_ICONS, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: SkillTab; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const tabs = SKILL_TABS.map((k) => ({ key: k, label: t(`editor.tabs.${k}`), icon: TAB_ICONS[k] }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 style={s.h1}>{skill.name}</h1>
        <Badge mono>{`v${skill.version}`}</Badge>
        <label style={s.enabled}>
          {t("editor.enabled")}
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} size={16} />
        </label>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
