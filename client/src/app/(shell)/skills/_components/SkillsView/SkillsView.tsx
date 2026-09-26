/* /skills — Skills Lab master-detail (mirrors the Agent Editor's shape:
   AgentEditorView). Left: search + SkillCards. Right: nothing selected
   (selectPrompt) | a skill's Config/Preview/Stats/Versions tabs | the /new
   create form. Selection lives in the URL (/skills, /skills/new, /skills/:id),
   not in component state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useCrumb } from "@/components/app-shell";
import { useSkills, useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SkillCard } from "./_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { ConfigTab } from "./_components/SkillDetail/_components/ConfigTab";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView({ mode }: { mode?: "new" }) {
  const t = useTranslations("skills");
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const id = mode === "new" ? undefined : params.id;

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const {
    data: skill,
    isLoading: skillLoading,
    isError: skillIsError,
    error: skillError,
    refetch: refetchSkill,
  } = useSkill(id);
  const update = useUpdateSkill();

  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);

  useCrumb([
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(mode === "new" ? [{ label: t("config.createTitle") }] : skill ? [{ label: skill.name }] : []),
  ]);

  const notFound = skillError instanceof ApiError && skillError.status === 404;

  return (
    <>
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      <div style={s.wrap}>
        <div style={s.leftPane}>
          <div style={s.leftHeader}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <Dropdown
              width={210}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: t("page.menu.create"), icon: "Edit", onClick: () => router.push("/skills/new") },
                { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
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
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={110} />
                <Skeleton height={110} />
                <Skeleton height={110} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setImporting(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDeleted={() => {
                  if (sk.id === id) router.push("/skills");
                }}
              />
            ))}
          </div>
        </div>

        <div style={s.rightPane}>
          {mode === "new" ? (
            <div style={s.newPane}>
              <ConfigTab skill={null} onCreated={(created) => router.push(`/skills/${created.id}`)} />
            </div>
          ) : id ? (
            skillIsError ? (
              <ErrorState
                fullScreen
                title={notFound ? t("detail.notFound.title") : t("detail.loadError")}
                body={notFound ? t("detail.notFound.body") : undefined}
                onRetry={notFound ? undefined : () => refetchSkill()}
              />
            ) : skillLoading || !skill ? (
              <div style={s.detailLoading}>
                <Skeleton height={24} width={240} />
                <Skeleton height={200} />
              </div>
            ) : (
              <SkillDetail skill={skill} />
            )
          ) : (
            <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
          )}
        </div>
      </div>
    </>
  );
}
