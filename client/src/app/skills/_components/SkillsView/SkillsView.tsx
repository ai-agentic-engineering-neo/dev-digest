/* /skills — Skills Lab (L02). Master-detail: a Skills column on the left
   (Add Skill, search, one SkillCard per skill) and the skill editor on the
   right for the skill named by ?skill=<id> (the first skill when none is
   named), with its tabs in ?tab=. "Add Skill" offers create-from-scratch
   (modal) or import-from-file (drawer with preview). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillEditor } from "../../[id]/_components/SkillEditor";
import { VALID_SKILL_TABS, type SkillTabKey } from "../../[id]/_components/SkillEditor/constants";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { filterSkills, skillsHref } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("skill");
  const rawTab = params.get("tab") ?? "";
  const tab: SkillTabKey = (VALID_SKILL_TABS as string[]).includes(rawTab) ? (rawTab as SkillTabKey) : "config";
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const all = skills ?? [];
  const list = filterSkills(all, search);
  // URL state, so replace: the Back button should leave the page, not step through selections.
  const select = (id: string) => router.replace(skillsHref(id, tab));
  const setTab = (next: string) => selectedId && router.replace(skillsHref(selectedId, next));

  // Nothing named in the URL: open the first skill, as the design does.
  const firstId = all[0]?.id ?? null;
  React.useEffect(() => {
    if (!selectedId && firstId) router.replace(skillsHref(firstId, tab));
  }, [selectedId, firstId, tab, router]);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: "/skills" }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      <div style={s.page}>
        <aside style={s.column} aria-label={t("page.heading")}>
          <div style={s.columnHead}>
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
                { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
                { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
              ]}
            />
          </div>
          <div style={s.searchWrap}>
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
          </div>
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={110} />
                <Skeleton height={110} />
                <Skeleton height={110} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && all.length > 0 && list.length === 0 && (
              <EmptyState icon="Search" title={t("page.noMatch.title")} body={t("page.noMatch.body")} />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => select(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </aside>
        {!isLoading && !isError && all.length === 0 ? (
          <section style={s.empty}>
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setCreating(true)}
            />
          </section>
        ) : selectedId ? (
          <SkillEditor id={selectedId} tab={tab} onTab={setTab} />
        ) : (
          <section style={s.empty}>
            <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
          </section>
        )}
      </div>
    </AppShell>
  );
}
