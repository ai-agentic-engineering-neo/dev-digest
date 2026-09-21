/* Route: /skills/:id — the skill detail page. Thin route entry; tab state lives
   in ?tab= so a Config/Preview/Versions view is linkable and survives reload. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SkillDetailView, DEFAULT_TAB, VALID_TABS } from "./_components/SkillDetailView";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : DEFAULT_TAB;

  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  return <SkillDetailView id={id} tab={tab} onTab={setTab} />;
}
