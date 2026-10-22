/* /skills/:id — the skill list plus the selected skill's editor.
   Tab state lives in ?tab= (config | preview | versions). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";
import { SkillEditor } from "./_components/SkillEditor";
import { SKILL_TABS, type SkillTab } from "./_components/SkillEditor/constants";
import { useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";

export default function SkillPage() {
  const t = useTranslations("skills");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const requested = search.get("tab") as SkillTab | null;
  const tab: SkillTab = requested && SKILL_TABS.includes(requested) ? requested : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  let content: React.ReactNode;
  if (isError && error instanceof ApiError && error.status === 404) {
    content = <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />;
  } else if (isError) {
    content = <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;
  } else if (isLoading || !skill) {
    content = (
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  } else {
    content = <SkillEditor skill={skill} tab={tab} onTab={setTab} />;
  }

  return (
    <SkillsWorkspace selectedId={id} selectedName={skill?.name} tab={tab}>
      {content}
    </SkillsWorkspace>
  );
}
