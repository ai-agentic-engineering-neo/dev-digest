/* SkillEditor — /skills/:id. Header with badges, then Config / Preview /
   Versioning tabs (?tab=). Data via useSkill; tabs keyed by id + version so a
   save or restore remounts the form with the fresh body. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "../../../../../components/app-shell";
import { SkillTypeTag } from "../../../../../components/skill-type-tag";
import { useSkill } from "../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../lib/api";
import { needsVetting } from "../../../helpers";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { SKILL_TABS, VALID_SKILL_TABS, type SkillTabKey } from "./constants";
import { s } from "./styles";

export function SkillEditor({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const raw = search.get("tab") ?? "";
  const tab: SkillTabKey = (VALID_SKILL_TABS as string[]).includes(raw) ? (raw as SkillTabKey) : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.crumb"), mono: true },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("panel.notFound.title")}
          body={error instanceof ApiError ? error.message : t("panel.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {isLoading || !skill ? (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      ) : (
        <div style={s.page}>
          <div style={s.header}>
            <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
            <h1 className="mono" style={s.name}>
              {skill.name}
            </h1>
            <SkillTypeTag type={skill.type} />
            <Badge mono>{t("card.version", { version: skill.version })}</Badge>
            <Badge>{t(`card.source.${skill.source}`)}</Badge>
            <Badge>{t("card.agentCount", { count: skill.agent_count })}</Badge>
            {!skill.enabled && <Badge color="var(--text-muted)">{t("card.disabled")}</Badge>}
            {needsVetting(skill) && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("card.needsVetting")}
              </Badge>
            )}
            <div style={{ marginLeft: "auto" }}>
              <Button kind="secondary" size="sm" icon="ChevronLeft" onClick={() => router.push("/skills")}>
                {t("editor.back")}
              </Button>
            </div>
          </div>
          <div style={s.tabsBar}>
            <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 28px" />
          </div>
          <div style={s.body}>
            {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
            {tab === "preview" && <PreviewTab skill={skill} />}
            {tab === "versioning" && <VersioningTab skill={skill} />}
          </div>
        </div>
      )}
    </AppShell>
  );
}
