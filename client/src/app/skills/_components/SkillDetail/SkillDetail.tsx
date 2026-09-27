/* SkillDetail — the right-hand pane of /skills: the selected skill's header and
   its four tabs. Tab state is owned by the route (?tab=), so a link into a
   specific tab is shareable and survives a reload. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { typeColor } from "../../helpers";
import { SKILL_TABS } from "../../constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onDeleted,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const color = typeColor(skill.type);
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  const remove = () => {
    del.mutate(skill.id, {
      onSuccess: () => {
        setConfirming(false);
        onDeleted();
      },
    });
  };

  return (
    <div style={s.wrap}>
      {confirming && (
        <ConfirmDialog
          title={t("detail.deleteTitle")}
          body={t("detail.deleteConfirm", { name: skill.name })}
          confirmLabel={t("detail.delete")}
          busy={del.isPending}
          error={del.error}
          onConfirm={remove}
          onCancel={() => {
            del.reset();
            setConfirming(false);
          }}
        />
      )}
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color }} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <Badge color={color} bg="var(--bg-hover)">
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)" mono icon="History">
          {t("detail.version", { version: skill.version })}
        </Badge>
        <div style={{ marginLeft: "auto" }}>
          <Button
            kind="secondary"
            size="sm"
            icon="Trash"
            disabled={del.isPending}
            onClick={() => setConfirming(true)}
          >
            {t("detail.delete")}
          </Button>
        </div>
      </div>

      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>

      <div style={s.body}>
        {/* Keyed on id AND version: the tab copies the body into form state
            at mount, so a different skill — or the same skill restored to an
            older version — has to remount rather than be synced by an effect. */}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
