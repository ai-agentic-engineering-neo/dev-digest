/* SkillEditor — right pane of the Skills page: header (name, type, version)
   and the Config / Preview / Stats / Versions tabs for one skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SkillTypeBadge } from "@/components/skill-badges";
import type { SkillTab } from "../SkillsView/constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ id, tab, onTab }: { id: string; tab: SkillTab; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={260} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (isError || !skill) {
    return (
      <ErrorState
        title={t("detail.loadErrorTitle")}
        body={error instanceof ApiError ? error.message : t("detail.loadErrorBody")}
        onRetry={() => refetch()}
      />
    );
  }

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 className="mono" style={s.title}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <span className="mono tnum" style={s.version}>
          <Icon.GitCommit size={12} />
          {t("detail.version", { version: skill.version })}
        </span>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* keyed by id + version: switching skills or restoring a version
            remounts the form with fresh values (no props→state sync effect) */}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
        {tab === "preview" && <PreviewTab skillId={skill.id} />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
