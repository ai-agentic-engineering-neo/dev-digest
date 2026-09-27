/* SkillDetailPane — the right pane of /skills/:id: the selected skill and its
   tabs, beside the list the layout keeps mounted.

   It reads the skill out of the same cached list the left pane renders, so a
   toggle or a rename on either side shows on both at once, with no second
   request. `?tab=` owns the open tab, so a link to "this skill, this tab"
   survives a reload. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkills } from "@/lib/hooks/skills";
import { SkillDetail } from "../SkillDetail";
import { resolveSkillTab, skillHref } from "../../helpers";
import { s } from "./styles";

export function SkillDetailPane() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();

  const id = decodeURIComponent(params.id);
  const tab = resolveSkillTab(search.get("tab"));
  const skill = (skills ?? []).find((sk) => sk.id === id) ?? null;

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={320} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={s.placeholder}>
        <ErrorState title={t("detail.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  // Deleted in another tab, or a stale link: say so, rather than show an
  // empty pane that looks like a rendering bug.
  if (!skill) {
    return (
      <div style={s.placeholder}>
        <EmptyState
          icon="Sparkles"
          title={t("detail.notFound.title")}
          body={t("detail.notFound.body")}
          cta={t("page.backToList")}
          onCta={() => router.push("/skills")}
        />
      </div>
    );
  }

  return (
    <SkillDetail
      skill={skill}
      tab={tab}
      onTab={(next) => router.replace(skillHref(skill.id, next))}
      onDeleted={() => router.push("/skills")}
    />
  );
}
