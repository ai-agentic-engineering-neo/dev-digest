"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

/**
 * Skill editor — header (name, type/source badges, the disabled "Run on
 * evals" button — D4) + the five-tab shell. The button lives here, not inside
 * `EvalsTab`, per the mockup.
 */
export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.h1} className="mono">
          {skill.name}
        </h1>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        {skill.source !== "manual" && (
          <Badge icon="Upload" color="var(--text-secondary)">
            {t(`listItem.source.${skill.source}`)}
          </Badge>
        )}
        {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
        <div style={{ marginLeft: "auto" }}>
          <Button kind="secondary" size="sm" icon="FlaskConical" disabled title={t("evals.runOnEvalsTooltip")}>
            {t("evals.runOnEvals")}
          </Button>
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "evals" && <EvalsTab />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
