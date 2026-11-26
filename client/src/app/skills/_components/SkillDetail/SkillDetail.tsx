/* SkillDetail — right pane of /skills/:id: header (type icon · name · type badge ·
   v{version}) + Tabs Config · Preview · Stats · Versions. The tab comes from ?tab=
   (resolved by the parent); not-found and load-error states are handled here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import type { SkillTab } from "../constants";
import { SkillTypeBadge, SkillTypeIcon } from "../SkillTypeBadge";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TAB_DEFS } from "./constants";
import { s } from "./styles";

export interface SkillDetailProps {
  skillId: string;
  tab: SkillTab;
  onTab: (tab: SkillTab) => void;
}

export function SkillDetail({ skillId, tab, onTab }: SkillDetailProps) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(skillId);

  if (isError && error instanceof ApiError && error.status === 404) {
    return <EmptyState icon="Search" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />;
  }
  if (isError) {
    return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;
  }
  if (isLoading || !skill) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const tabs = TAB_DEFS.map((def) => ({ key: def.key, label: t(`detail.tabs.${def.key}`), icon: def.icon }));
  return (
    <>
      <div style={s.header}>
        <SkillTypeIcon type={skill.type} size={28} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <Badge icon="History" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(key) => onTab(key as SkillTab)} pad="0 24px" />
      </div>
      <div style={s.body}>
        <TabBody tab={tab} skill={skill} />
      </div>
    </>
  );
}

function TabBody({ tab, skill }: { tab: SkillTab; skill: Skill }) {
  switch (tab) {
    case "preview":
      return <PreviewTab skill={skill} />;
    case "stats":
      return <StatsTab skill={skill} />;
    case "versions":
      return <VersionsTab skill={skill} />;
    case "config":
      // key: a new version (save with a body change, restore) or another skill
      // remounts the form so it starts from the saved values — no sync effect.
      return <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />;
  }
}
