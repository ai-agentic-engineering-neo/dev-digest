/* /skills — the skill library. A grid of skills, and one "Add" menu that forks
   into create/import. Opening a skill goes to /skills/:id, where it can be
   configured, previewed and rolled back. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { AddSkillMenu, useAddSkillFlow } from "../AddSkillMenu";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<Skill | null>(null);

  const list = filterSkills(skills ?? [], search);
  const open = (id: string) => router.push(`/skills/${id}`);
  const addFlow = useAddSkillFlow((sk) => open(sk.id));

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await del.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {addFlow.modals}
      {pendingDelete && (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { name: pendingDelete.name })}
          confirmLabel={del.isPending ? t("delete.deleting") : t("delete.confirm")}
          cancelLabel={t("delete.cancel")}
          pending={del.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
              aria-label={t("page.searchPlaceholder")}
            />
          </div>
          <AddSkillMenu flow={addFlow} />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={addFlow.openCreate}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => open(skill.id)}
                onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                onDelete={() => setPendingDelete(skill)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
