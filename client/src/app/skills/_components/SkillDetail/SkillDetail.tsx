/* SkillDetail — right pane: header (icon, name, type, version) + Config / Preview / Stats tabs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, tintOf } from "@/lib/skills";
import { SKILL_TABS, type SkillTab } from "./constants";
import { SkillConfigTab } from "./_components/SkillConfigTab";
import { SkillPreviewTab } from "./_components/SkillPreviewTab";
import { SkillStatsTab } from "./_components/SkillStatsTab";
import { s } from "./styles";

interface Props {
  skill: Skill;
  tab: SkillTab;
  onTabChange: (tab: SkillTab) => void;
  onDeleted: (id: string) => void;
}

export function SkillDetail({ skill, tab, onTabChange, onDeleted }: Props) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    <section style={s.root} aria-label={skill.name}>
      <div style={s.head}>
        <span style={s.tile(color, tintOf(color))}>
          <Icon.Sparkles size={16} />
        </span>
        <h2 className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </h2>
        <Badge color={color} bg={tintOf(color)}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge mono icon="GitCommit">
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      <Tabs
        pad="8px 28px 0"
        value={tab}
        onChange={(k) => onTabChange(k as SkillTab)}
        tabs={SKILL_TABS.map((key) => ({ key, label: t(`detail.tabs.${key}`) }))}
      />
      <div style={s.body}>
        {tab === "config" && <SkillConfigTab key={skill.id} skill={skill} onDeleted={onDeleted} />}
        {tab === "preview" && <SkillPreviewTab skill={skill} />}
        {tab === "stats" && <SkillStatsTab skillId={skill.id} />}
      </div>
    </section>
  );
}
