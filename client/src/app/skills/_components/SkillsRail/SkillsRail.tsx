"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useDeleteSkill, useSkillAgents, useSkills } from "../../../../lib/hooks/skills";
import { filterSkills } from "../../helpers";
import { SkillRailCard } from "./_components/SkillRailCard";
import { NewSkillModal } from "./_components/NewSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { s } from "./styles";

/** The `/skills` rail: search, "Add Skill", the card list, and (§5.4) the
 * delete confirmation that names the agents currently linking a skill. */
export function SkillsRail({ activeId }: { activeId?: string | null }) {
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
    del.mutate(deleteTarget.id, {
      onSuccess: () => {
        if (activeId === deleteTarget.id) router.push("/skills");
        setDeleteTarget(null);
      },
    });
  };

  return (
    <div style={s.wrap}>
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

      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
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
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={78} />
            <Skeleton height={78} />
            <Skeleton height={78} />
          </>
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
        {list.map((skill) => (
          <SkillRailCard
            key={skill.id}
            skill={skill}
            active={skill.id === activeId}
            onClick={() => router.push(`/skills/${skill.id}?tab=config`)}
            onDeleteRequest={setDeleteTarget}
          />
        ))}
      </div>
    </div>
  );
}
