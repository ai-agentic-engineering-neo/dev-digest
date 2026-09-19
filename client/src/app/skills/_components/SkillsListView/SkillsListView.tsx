"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useDeleteSkill, useSkillAgents, useSkills } from "../../../../lib/hooks/skills";
import { filterSkills } from "../../helpers";
import { SkillCard } from "../SkillCard";
import { NewSkillModal } from "../SkillsRail/_components/NewSkillModal";
import { ImportSkillDrawer } from "../SkillsRail/_components/ImportSkillDrawer";
import { s } from "./styles";

/**
 * `/skills` — the Skills Lab list (mirrors `AgentsListView`'s grid so the two
 * list pages read as one system): header (title/subtitle, search, Add Skill),
 * a card grid, and the delete confirmation that names the agents currently
 * linking a skill (§5.4). Selecting a card navigates to the rail + tabbed
 * editor at `/skills/:id`, unchanged.
 */
export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const del = useDeleteSkill();

  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<SkillSummary | null>(null);

  const { data: linkedAgents } = useSkillAgents(deleteTarget?.id);
  const list = filterSkills(skills ?? [], search);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      {creating && <NewSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      {deleteTarget && (
        <Modal
          title={t("delete.title", { name: deleteTarget.name })}
          onClose={() => setDeleteTarget(null)}
          footer={
            <div style={s.deleteFooter}>
              <Button kind="ghost" onClick={() => setDeleteTarget(null)}>
                {t("delete.cancel")}
              </Button>
              <Button kind="danger" onClick={confirmDelete} disabled={del.isPending}>
                {t("delete.confirm")}
              </Button>
            </div>
          }
        >
          <div style={s.deleteBody}>
            {linkedAgents && linkedAgents.length > 0
              ? t("delete.usedByWarning", { agents: linkedAgents.map((a) => a.name).join(", ") })
              : t("delete.noAgents")}
          </div>
        </Modal>
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
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.newSkill"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && skills && skills.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => router.push(`/skills/${skill.id}?tab=config`)}
                onDeleteRequest={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
