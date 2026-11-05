/* SkillDetail — right panel of the Skills Lab: header (icon, name, type,
   vN, Run on evals) + tabs Config · Preview · Evals · Stats · Versions.
   `skill === null` = create mode (only the Config form). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { TAB_KEYS, type SkillTab } from "../../constants";
import { isImportedSkill } from "../../helpers";
import { ConfigTab } from "../ConfigTab";
import { EvalsTab } from "../EvalsTab";
import { PreviewTab } from "../PreviewTab";
import { StatsTab } from "../StatsTab";
import { VersionsTab } from "../VersionsTab";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onCreated,
  onDeleted,
  onDirtyChange,
}: {
  skill: Skill | null;
  tab: SkillTab;
  onTab: (tab: SkillTab) => void;
  onCreated: (skill: Skill) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const imported = skill ? isImportedSkill(skill) : false;
  const tabs = (skill ? TAB_KEYS : (["config"] as const)).map((k) => ({ key: k, label: t(`detail.tabs.${k}`) }));
  const active: SkillTab = skill ? tab : "config";

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div style={s.iconBox(imported)}>
          <Icon.Sparkles size={16} />
        </div>
        <span className="mono" style={s.name}>
          {skill ? skill.name : t("detail.newSkill")}
        </span>
        {skill && (
          <>
            <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
            <span className="mono" style={s.chip}>
              {t("detail.version", { version: skill.version })}
            </span>
          </>
        )}
        <span style={s.spacer} />
        {skill && (
          <span title={t("detail.runEvalsSoon")}>
            <Button icon="Play" disabled>
              {t("detail.runEvals")}
            </Button>
          </span>
        )}
      </div>
      <Tabs tabs={tabs} value={active} onChange={(k) => onTab(k as SkillTab)} />
      <div style={s.body}>
        {active === "config" && (
          <ConfigTab
            key={skill?.id ?? "new"}
            skill={skill ?? undefined}
            onCreated={onCreated}
            onDeleted={onDeleted}
            onDirtyChange={onDirtyChange}
          />
        )}
        {skill && active === "preview" && <PreviewTab skill={skill} />}
        {skill && active === "evals" && <EvalsTab />}
        {skill && active === "stats" && <StatsTab skillId={skill.id} />}
        {skill && active === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
