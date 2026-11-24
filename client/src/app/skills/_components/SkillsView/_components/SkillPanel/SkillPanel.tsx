/* SkillPanel — the right-hand panel that opens when a skill card is clicked:
   name + close, then Config / Preview / Versioning tabs. Tab state is local; the
   parent re-keys the panel per skill so each selection starts on DEFAULT_TAB. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn, Tabs } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { DEFAULT_TAB, TABS, type PanelTab } from "./constants";
import { s } from "./styles";

export function SkillPanel({ skill, onClose }: { skill: SkillListItem; onClose: () => void }) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<PanelTab>(DEFAULT_TAB);
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <section aria-label={skill.name} style={s.wrap}>
      <div style={s.head}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <IconBtn icon="X" label={t("preview.close")} onClick={onClose} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as PanelTab)} pad="0 20px" />
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab skill={skill} agentCount={skill.agent_count} />
        ) : tab === "versioning" ? (
          <VersioningTab skill={skill} />
        ) : (
          <ConfigTab skill={skill} />
        )}
      </div>
    </section>
  );
}
