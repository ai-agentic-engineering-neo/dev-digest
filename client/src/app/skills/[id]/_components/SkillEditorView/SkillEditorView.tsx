/* SkillEditorView — /skills/:id, laid out like the agent editor: the skill list
   in a left sidebar + the tabbed editor for the selected skill. Once the skill
   is loaded, SkillWorkspace (keyed by id) owns the draft and guards leaving it;
   while loading or on error only the sidebar and a placeholder pane show. The
   tab comes from ?tab= (resolved by the route) and is kept when switching. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { SkillTab } from "@/app/skills/constants";
import { skillHref, skillsHref } from "@/app/skills/helpers";
import { SkillSidebar } from "./_components/SkillSidebar";
import { SkillWorkspace } from "./_components/SkillWorkspace";
import { s } from "./styles";

export function SkillEditorView({ id, tab }: { id: string; tab: SkillTab }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: skill, isLoading, error, refetch } = useSkill(id);
  const go = (next: string) => router.push(skillHref(next, tab));

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: skillsHref() },
    { label: skill ? `${skill.name}.md` : t("editor.crumbFallback") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        {skill ? (
          <SkillWorkspace
            key={skill.id}
            skill={skill}
            tab={tab}
            onTab={(next) => router.replace(skillHref(id, next))}
            onGo={go}
          />
        ) : (
          <>
            <SkillSidebar activeId={id} onOpen={go} />
            <div style={s.pane}>
              {isLoading ? (
                <>
                  <Skeleton height={24} width={240} />
                  <Skeleton height={240} />
                </>
              ) : (
                <ErrorState
                  title={t("editor.loadErrorTitle")}
                  body={error instanceof ApiError && error.status !== 404 ? error.message : t("editor.loadErrorBody")}
                  onRetry={() => refetch()}
                  retryLabel={tc("actions.retry")}
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
