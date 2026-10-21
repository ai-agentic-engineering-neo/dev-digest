/* SkillEditor — the right pane of /skills: header (icon chip, mono name, type
   tag, version and source badges) over Config / Context / Preview / Versions
   tabs. The tab lives in ?tab= and is owned by the page (SkillsView), like the
   agent editor. Data via useSkill; tabs keyed by id + version so a save or
   restore remounts the form with the fresh body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { SkillTypeTag } from "../../../../../components/skill-type-tag";
import { SKILL_TYPE_COLOR } from "../../../../../components/skill-type-tag/constants";
import { useSkill } from "../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../lib/api";
import { needsVetting } from "../../../helpers";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { SKILL_TABS, type SkillTabKey } from "./constants";
import { s } from "./styles";

export interface SkillEditorProps {
  id: string;
  tab: SkillTabKey;
  onTab: (tab: string) => void;
}

export function SkillEditor({ id, tab, onTab }: SkillEditorProps) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  if (isError || (!isLoading && !skill)) {
    return (
      <section style={s.pane} data-testid="skill-editor">
        <ErrorState
          title={t("panel.notFound.title")}
          body={error instanceof ApiError ? error.message : t("panel.notFound.body")}
          onRetry={() => refetch()}
        />
      </section>
    );
  }
  if (isLoading || !skill) {
    return (
      <section style={s.pane} data-testid="skill-editor">
        <div style={s.skeleton}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      </section>
    );
  }

  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    <section style={s.pane} data-testid="skill-editor" aria-label={skill.name}>
      <header style={s.header}>
        <span style={s.chip(color.c, color.bg)} aria-hidden>
          <Icon.Sparkles size={14} />
        </span>
        <h1 className="mono" style={s.name}>
          {skill.name}
        </h1>
        <SkillTypeTag type={skill.type} />
        <Badge mono icon="Eye">
          {t("card.version", { version: skill.version })}
        </Badge>
        <Badge>{t(`card.source.${skill.source}`)}</Badge>
        <Badge>{t("card.agentCount", { count: skill.agent_count })}</Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("card.disabled")}</Badge>}
        {needsVetting(skill) && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("card.needsVetting")}
          </Badge>
        )}
      </header>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
        {tab === "context" && <ContextTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versioning" && <VersioningTab skill={skill} />}
      </div>
    </section>
  );
}
