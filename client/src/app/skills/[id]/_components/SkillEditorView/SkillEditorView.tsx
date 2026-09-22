/* SkillEditorView — /skills/:id: header (name.md, type, version) + the tabbed
   SkillEditor. The tab comes from ?tab= (resolved by the route). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { SkillTab } from "@/app/skills/constants";
import { skillHref, skillsHref } from "@/app/skills/helpers";
import { SkillEditor } from "../SkillEditor";
import { s } from "./styles";

export function SkillEditorView({ id, tab }: { id: string; tab: SkillTab }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: skillsHref() },
    { label: skill ? `${skill.name}.md` : t("editor.crumbFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError && error.status !== 404 ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
          retryLabel={tc("actions.retry")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {isLoading || !skill ? (
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={240} />
        </div>
      ) : (
        <div style={s.main}>
          <div style={s.header}>
            <Icon.Sparkles size={18} style={s.icon} />
            <h1 className="mono" style={s.title}>
              {skill.name}.md
            </h1>
            <SkillTypeBadge type={skill.type} />
            <Badge color="var(--text-secondary)" mono>
              v{skill.version}
            </Badge>
            {!skill.enabled && <Badge color="var(--text-muted)">{t("drawer.disabled")}</Badge>}
          </div>
          <SkillEditor key={skill.id} skill={skill} tab={tab} onTab={(next) => router.replace(skillHref(id, next))} />
        </div>
      )}
    </AppShell>
  );
}
