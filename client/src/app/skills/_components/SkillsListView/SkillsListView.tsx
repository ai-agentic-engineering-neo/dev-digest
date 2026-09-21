/* /skills — Skills list. Search + "Add Skill" (import from file) + one row per
   skill (toggle, badges, usage metrics). Selecting a skill navigates to the
   4-tab editor at /skills/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillRow, filterSkills } from "../SkillRow";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const all = skills ?? [];
  const list = filterSkills(all, search);
  const showEmpty = !isLoading && !isError && all.length === 0;
  const showNoMatch = !isLoading && !isError && all.length > 0 && list.length === 0;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(sk) => router.push(`/skills/${sk.id}?tab=config`)}
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
              aria-label={t("page.searchPlaceholder")}
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
            items={[{ label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) }]}
          />
        </div>

        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {showEmpty && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        )}
        {showNoMatch && <EmptyState icon="Search" title={t("page.noResults")} />}
        {list.length > 0 && (
          <div style={s.list}>
            {list.map((sk) => (
              <SkillRow
                key={sk.id}
                skill={sk}
                onClick={() => router.push(`/skills/${sk.id}?tab=config`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
