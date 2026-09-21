/* /skills/:id — Skill editor. Left skill list + right 4-tab editor
   (Config / Preview / Stats / Versions). Tab state lives in ?tab=, mirroring
   /agents/:id. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Icon, Badge, SkillTypeTag } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { InjectionBadge } from "../_components/InjectionBadge";
import { SkillsPanel } from "../_components/SkillsPanel";
import { SkillEditor } from "./_components/SkillEditor";
import { s } from "./styles";

const VALID_TABS = ["config", "preview", "stats", "versions"];

export default function SkillEditorPage() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  const notFound = (isError && error instanceof ApiError && error.status === 404) || (!isLoading && !isError && !skill);
  if (notFound) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
      </AppShell>
    );
  }
  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <SkillsPanel activeId={id} tab={tab} />

        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.header}>
              <Icon.Sparkles size={18} style={s.headerIcon} />
              <h1 className="mono" style={s.h1}>
                {skill.name}
              </h1>
              <SkillTypeTag type={skill.type} label={t(`listItem.type.${skill.type}`)} />
              <Badge color="var(--text-secondary)" icon="Tag" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              {skill.injection_detected && <InjectionBadge />}
              {!skill.enabled && <Badge color="var(--text-muted)">{t("detail.disabledBadge")}</Badge>}
            </div>
            <div style={s.body}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
