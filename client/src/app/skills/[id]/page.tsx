/* /skills/:id — Skill Editor inside the two-pane Skills screen. Tabs: Config,
   Preview, Stats, Versions, and an Evals mount point (L06). Tab state lives
   in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";
import { SkillEditor, TAB_KEYS } from "./_components/SkillEditor";
import { SkillTypeBadge, TYPE_COLOR } from "../../../components/skill-type-badge";
import { useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";
import { s } from "./styles";

export default function SkillEditorPage() {
  const t = useTranslations("skills");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = TAB_KEYS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  return (
    <SkillsWorkspace activeId={id} activeName={skill?.name} tab={tab}>
      {isError || (!isLoading && !skill) ? (
        <ErrorState
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
        />
      ) : isLoading || !skill ? (
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      ) : (
        <>
          <div style={s.header}>
            <div style={s.iconBox(TYPE_COLOR[skill.type])}>
              <Icon.Sparkles size={15} />
            </div>
            <h1 className="mono" style={s.h1}>
              {skill.name}
            </h1>
            <SkillTypeBadge type={skill.type} />
            <span className="mono" style={s.versionChip}>
              <Icon.GitCommit size={12} />
              {t("preview.version", { version: skill.version })}
            </span>
            <div style={s.headerRight}>
              {/* The eval runner ships with L06 — the action is a visible mount point. */}
              <span title={t("editor.runOnEvalsHint")}>
                <Button kind="secondary" size="sm" icon="Play" disabled>
                  {t("editor.runOnEvals")}
                </Button>
              </span>
            </div>
          </div>
          <div style={s.body}>
            <SkillEditor skill={skill} tab={tab} onTab={setTab} />
          </div>
        </>
      )}
    </SkillsWorkspace>
  );
}
