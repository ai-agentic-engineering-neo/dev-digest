/* /skills/:id — rail + tabbed editor (D1). Active tab lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillsRail } from "../_components/SkillsRail";
import { SkillEditor } from "../_components/SkillEditor";
import { useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";
import { s } from "../styles";

const VALID_TABS = ["config", "preview", "evals", "stats", "versions"];

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const t = useTranslations("skills");

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    const notFound = !isError;
    return (
      <AppShell crumb={crumb}>
        <div style={s.shell}>
          <SkillsRail activeId={id} />
          <ErrorState
            fullScreen
            title={notFound ? t("detail.notFound.title") : t("editor.loadErrorTitle")}
            body={
              notFound
                ? t("detail.notFound.body")
                : error instanceof ApiError
                  ? error.message
                  : t("detail.loadError")
            }
            onRetry={() => refetch()}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.shell}>
        <SkillsRail activeId={id} />
        {isLoading || !skill ? (
          <div style={s.loadingPane}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <SkillEditor skill={skill} tab={tab} onTab={setTab} />
        )}
      </div>
    </AppShell>
  );
}
