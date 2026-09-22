/* SkillEditor — the tabbed editor for one skill (Config · Preview · Versions ·
   Stats). Owns the draft so every tab sees it: Preview renders the unsaved
   body, Versions disables Restore while dirty, and the unsaved-changes guard
   covers the whole screen. The parent keys it by skill id. */
"use client";

import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TAB_ICONS, SKILL_TABS, type SkillTab } from "@/app/skills/constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { useSkillDraft } from "./useSkillDraft";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: SkillTab; onTab: (tab: SkillTab) => void }) {
  const t = useTranslations("skills");
  const draft = useSkillDraft(skill);
  useUnsavedChangesGuard(draft.dirty, t("editor.unsavedConfirm"));
  const tabs = SKILL_TABS.map((key) => ({ key, label: t(`editor.tabs.${key}`), icon: SKILL_TAB_ICONS[key] }));

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as SkillTab)} pad="0 28px" />
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} draft={draft} />}
        {tab === "preview" && (
          <PreviewTab name={draft.form.name} description={draft.form.description} body={draft.form.body} />
        )}
        {tab === "versions" && <VersionsTab skill={skill} dirty={draft.dirty} />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
      </div>
    </div>
  );
}
