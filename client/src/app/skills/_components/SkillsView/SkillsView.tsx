/* /skills — Skills Lab (L02). Card grid (name, type, description, version,
   agent count, enabled toggle, delete) + side preview for the skill named by
   ?skill=<id>; the full editor lives at /skills/:id. "Add Skill" offers
   create-from-scratch (modal) or import-from-file (drawer with preview). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { SkillCard } from "../SkillCard";
import { SkillPanel } from "../SkillPanel";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("skill") ?? undefined;
  // URL state, so replace: the Back button should leave the page, not step through selections.
  const select = (id: string | null) => router.replace(id ? `/skills?skill=${id}` : "/skills");
  const confirmDelete = () => {
    if (!deleting) return;
    del.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(t("panel.deletedToast"));
        if (deleting.id === selectedId) select(null);
        setDeleting(null);
      },
    });
  };
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: "/skills" }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      {deleting && (
        <ConfirmDialog
          title={t("confirm.title", { name: deleting.name })}
          body={t("confirm.body")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          pending={del.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      <div style={s.page}>
        <div style={s.main}>
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
                { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
                { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
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
          {!isLoading && !isError && (skills ?? []).length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setCreating(true)}
            />
          )}
          {!isLoading && !isError && (skills ?? []).length > 0 && list.length === 0 && (
            <EmptyState icon="Search" title={t("page.noMatch.title")} body={t("page.noMatch.body")} />
          )}
          {list.length > 0 && (
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selectedId}
                  onClick={() => select(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                  onDelete={() => setDeleting({ id: sk.id, name: sk.name })}
                />
              ))}
            </div>
          )}
        </div>
        {selectedId && <SkillPanel key={selectedId} id={selectedId} onClose={() => select(null)} />}
      </div>
    </AppShell>
  );
}
