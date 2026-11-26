/* /skills/:id — one skill, full width (no list beside it): back link, header, and
   the Config · Preview · Stats · Versions tabs. The tab lives in ?tab=. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks/skills";
import { resolveSkillTab, skillHref } from "../helpers";
import { SkillDetail } from "../SkillDetail";
import { s } from "./styles";

export function SkillDetailView({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  // Same query as SkillDetail's (deduped by TanStack Query): only the breadcrumb needs the name.
  const { data: skill } = useSkill(skillId);
  const tab = resolveSkillTab(search.get("tab"));

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
      </div>
    </AppShell>
  );
}
