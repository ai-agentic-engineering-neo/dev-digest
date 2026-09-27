/* SkillsIndex — the right pane of /skills when nothing is selected.

   It also forwards the OLD address form. Selection used to live in the query
   string (`/skills?skill=<id>&tab=…`); links in PR descriptions, docs and
   bookmarks still carry it, and they now land on `/skills/<id>` instead of on
   an empty pane. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { skillHref } from "../../helpers";
import { s } from "./styles";

export function SkillsIndex() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const legacyId = search.get("skill");
  const legacyTab = search.get("tab");

  React.useEffect(() => {
    if (legacyId) router.replace(skillHref(legacyId, legacyTab));
  }, [legacyId, legacyTab, router]);

  if (legacyId) return null;

  return (
    <div style={s.placeholder}>
      <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
    </div>
  );
}
