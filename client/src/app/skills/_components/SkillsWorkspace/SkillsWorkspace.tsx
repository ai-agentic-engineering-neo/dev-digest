/* SkillsWorkspace — /skills shell: skill list on the left (search, add, toggle,
   delete), the selected skill (children) on the right. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { AddSkillModal, type AddSkillTab } from "../AddSkillModal";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsWorkspace({
  selectedId,
  selectedName,
  tab,
  children,
}: {
  selectedId?: string;
  selectedName?: string;
  /** Kept when switching skills so the user stays on the same tab. */
  tab?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [adding, setAdding] = React.useState<AddSkillTab | null>(null);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(selectedId ? [{ label: selectedName ?? t("detail.crumbSkill") }] : []),
  ];

  const remove = (id: string, name: string) => {
    if (!window.confirm(t("card.deleteConfirm", { name }))) return;
    del.mutate(id, { onSuccess: () => id === selectedId && router.push("/skills") });
  };

  return (
    <AppShell crumb={crumb}>
      {adding && (
        <AddSkillModal
          initialTab={adding}
          onClose={() => setAdding(null)}
          onCreated={(skill) => {
            setAdding(null);
            router.push(`/skills/${skill.id}?tab=config`);
          }}
        />
      )}
      <div style={s.page}>
        <div style={s.list}>
          <div style={s.listHead}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={200}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("add.tabs.create"), icon: "Edit", onClick: () => setAdding("create") },
                  { label: t("add.tabs.file"), icon: "Upload", onClick: () => setAdding("file") },
                ]}
              />
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
          </div>
          <div style={s.scroll}>
            {isLoading && (
              <>
                <Skeleton height={110} />
                <div style={s.spacer} />
                <Skeleton height={110} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && skills?.length !== 0 && list.length === 0 && (
              <div style={s.muted}>{t("page.noMatch")}</div>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab ?? "config"}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => remove(sk.id, sk.name)}
                deleting={del.isPending && del.variables === sk.id}
              />
            ))}
          </div>
        </div>

        <div style={s.main}>
          {children ??
            (skills?.length === 0 ? (
              <div style={s.center}>
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.cta")}
                  onCta={() => setAdding("create")}
                />
              </div>
            ) : (
              <div style={s.center}>
                <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
              </div>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
