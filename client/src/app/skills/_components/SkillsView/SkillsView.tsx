/* SkillsView — /skills and /skills/:id (M2). Master-detail like Agents: the
   skill list on the left, the selected skill's editor (Config / Preview /
   Stats / Versions, tab in ?tab=) on the right. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkill } from "@/lib/hooks/skills";
import { SkillsSidebar } from "../SkillsSidebar";
import { SkillEditor } from "../SkillEditor";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { DEFAULT_TAB, isValidTab } from "./constants";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const params = useParams<{ id?: string }>();
  const id = params?.id;
  const search = useSearchParams();
  const router = useRouter();
  const skills = useSkills();
  const { data: skill } = useSkill(id);
  const [modal, setModal] = React.useState<"create" | "import" | null>(null);

  const requestedTab = search.get("tab");
  const tab = isValidTab(requestedTab) ? requestedTab : DEFAULT_TAB;
  const setTab = (next: string) => router.replace(`/skills/${id}?tab=${next}`);
  const open = (skillId: string) => router.push(`/skills/${skillId}?tab=${tab}`);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(id ? [{ label: skill?.name ?? t("detail.crumbFallback") }] : []),
  ];

  const noSkills = skills.data !== undefined && skills.data.length === 0;

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <SkillsSidebar
          query={skills}
          activeId={id}
          onSelect={open}
          onCreate={() => setModal("create")}
          onImport={() => setModal("import")}
        />
        <div style={s.main}>
          {id ? (
            <SkillEditor id={id} tab={tab} onTab={setTab} />
          ) : (
            <div style={s.placeholder}>
              {noSkills ? (
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.cta")}
                  onCta={() => setModal("create")}
                />
              ) : (
                <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
              )}
            </div>
          )}
        </div>
      </div>
      {modal === "create" && <CreateSkillModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportSkillModal onClose={() => setModal(null)} />}
    </AppShell>
  );
}
