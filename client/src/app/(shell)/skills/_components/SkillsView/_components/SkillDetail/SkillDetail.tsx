"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, Icon, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSearchParamState } from "@/lib/hooks/useSearchParamState";
import { TYPE_COLOR, TYPE_ICON } from "@/lib/skill-display";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS, VALID_TABS } from "./constants";
import { s } from "./styles";

export function SkillDetail({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const [tabParam, setTab] = useSearchParamState("tab");
  const tab = VALID_TABS.includes(tabParam ?? "") ? tabParam! : "config";
  const TypeIcon = Icon[TYPE_ICON[skill.type]];
  const typeColor = TYPE_COLOR[skill.type];
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <TypeIcon size={18} style={{ color: typeColor }} />
        <h1 style={s.h1}>{skill.name}</h1>
        <Badge color={typeColor} bg={typeColor + "1a"}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("detail.versionBadge", { version: skill.version })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
