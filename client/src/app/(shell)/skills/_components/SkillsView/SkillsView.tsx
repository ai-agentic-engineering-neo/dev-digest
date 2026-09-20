/* SkillsView — sidebar (search + list) + tabbed editor. Used by both /skills
   (no selection) and /skills/:id (selected skill); the :id param comes from
   whichever route actually rendered it. Tab state lives in ?tab=.
   Mirrors agents/[id]/_components/AgentEditorView/AgentEditorView.tsx. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { ShellCrumb } from "@/components/app-shell";
import { useSkill, useSkills, useUpdateSkill } from "@/lib/api/skills";
import { ApiError } from "@/lib/api/client";
import { SkillCard } from "../SkillCard";
import { typeColor } from "../SkillCard/helpers";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SkillEditor } from "./_components/SkillEditor";
import { filterSkills } from "./helpers";
import { s } from "./styles";

const VALID_TABS = ["config", "preview", "versions"];

export function SkillsView() {
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("skills");
  const id = params.id;

  const { data: skills, isLoading: listLoading, isError: listError, refetch: refetchList } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    if (!id) return;
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  // ANOTHER TASK adds the import drawer (file/URL/community). This just opens
  // the seam — wire it to a real drawer there.
  const onImport = () => {
    /* TODO(import): open the import drawer. */
  };

  const list = filterSkills(skills ?? [], query);

  const crumb = id
    ? [
        { label: t("page.crumbLab") },
        { label: t("page.crumbSkills"), href: "/skills" },
        { label: skill?.name ?? t("detail.crumbSkill") },
      ]
    : [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <>
      <ShellCrumb items={crumb} />
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={s.container}>
        {/* left: skill list */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarHeaderTop}>
              <h1 style={s.sidebarTitle}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: onImport },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.sidebarList}>
            {listLoading && (
              <>
                <Skeleton height={82} style={s.skeletonCard} />
                <Skeleton height={82} style={s.skeletonCard} />
                <Skeleton height={82} style={s.skeletonCard} />
              </>
            )}
            {listError && <ErrorState body={t("page.loadError")} onRetry={() => refetchList()} />}
            {!listLoading && !listError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={onImport}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* right: editor */}
        <div style={s.rightPane}>
          {!id && (
            <div style={s.emptyWrapper}>
              <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
            </div>
          )}
          {id && (isError || (!isLoading && !skill)) && (
            <ErrorState
              fullScreen
              title={t("detail.notFound.title")}
              body={error instanceof ApiError ? error.message : t("detail.loadError")}
              onRetry={() => refetch()}
            />
          )}
          {id && !isError && (isLoading || !skill) && (
            <div style={s.editorSkeletonContainer}>
              <Skeleton height={24} width={240} />
              <Skeleton height={200} />
            </div>
          )}
          {id && skill && (
            <div style={s.editorWrapper}>
              <div style={s.editorHeader}>
                <Icon.Sparkles size={18} style={s.editorHeaderIcon} />
                <h1 style={s.editorTitle}>{skill.name}</h1>
                <Badge color={typeColor(skill.type)} bg={typeColor(skill.type) + "1a"}>
                  {t(`listItem.type.${skill.type}`)}
                </Badge>
                <Badge mono>{t("preview.version", { version: skill.version })}</Badge>
                {skill.source !== "manual" && (
                  <span title={t("listItem.vettingTitle")}>
                    <Badge icon="AlertTriangle" color="var(--text-muted)">
                      {t("listItem.needsVetting")}
                    </Badge>
                  </span>
                )}
              </div>
              <div style={s.editorContent}>
                <SkillEditor skill={skill} tab={tab} onTab={setTab} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
