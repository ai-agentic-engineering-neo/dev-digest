/* /skills/:id — one skill, full width (no list beside it): back link, header, and
   the Config · Preview · Stats · Versions tabs. The tab lives in ?tab=.
   `&suggest=1` (set right after a create / merge) opens AgentSuggestionsDialog —
   only once the merge-conflicts dialog (if any) is done; closing it drops the param. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks/skills";
import { useMergeConflicts } from "@/lib/hooks/conventions";
import { SUGGEST_AGENTS_PARAM } from "../constants";
import { resolveSkillTab, skillHref, wantsAgentSuggestions } from "../helpers";
import { AgentSuggestionsDialog } from "../AgentSuggestionsDialog";
import { SkillDetail } from "../SkillDetail";
import { s } from "./styles";

export function SkillDetailView({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  // Same query as SkillDetail's (deduped by TanStack Query): only the breadcrumb needs the name.
  const { data: skill } = useSkill(skillId);
  const tab = resolveSkillTab(search.get("tab"));
  // Never-fetched cache read: conflicts the last merge left (MergeConflictsDialog goes first).
  const conflictsPending = (useMergeConflicts(skillId).data ?? []).length > 0;
  const suggestAgents = wantsAgentSuggestions(search.get(SUGGEST_AGENTS_PARAM)) && !conflictsPending;

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/skills" style={s.back}>
          {t("detail.back")}
        </Link>
        <SkillDetail skillId={skillId} tab={tab} onTab={(next) => router.replace(skillHref(skillId, next))} />
        {suggestAgents && skill && (
          <AgentSuggestionsDialog skill={skill} onClose={() => router.replace(skillHref(skillId, tab))} />
        )}
      </div>
    </AppShell>
  );
}
