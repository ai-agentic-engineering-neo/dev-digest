/* Route: /skills/:id — the skill list beside one skill's detail pane. The tab
   lives in ?tab= (unknown → config). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SkillsLayout } from "../_components/SkillsLayout";
import { SkillDetail } from "../_components/SkillDetail";
import { parseTab, skillHref } from "../helpers";
import type { SkillTab } from "../constants";

export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = parseTab(search.get("tab"));
  const setTab = (next: SkillTab) => router.replace(skillHref(id, next));

  return (
    <SkillsLayout selectedId={id} tab={tab}>
      <SkillDetail key={id} id={id} tab={tab} onTab={setTab} />
    </SkillsLayout>
  );
}
