/* SkillsLayout — the Skills Lab frame shared by /skills and /skills/:id: a
   280 px list column (search, Add Skill menu, cards) and a right pane. With no
   selected skill the pane shows the empty state or the "Select a skill" prompt. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSetSkillEnabled, useSkills } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { DEFAULT_TAB, type SkillTab } from "../../constants";
import { skillHref } from "../../helpers";
import { LIST_SKELETONS, SKELETON_HEIGHT } from "./constants";
import { filterSkills, hasNoMatch, hasNoSkills } from "./helpers";
import { s } from "./styles";

type Overlay = "create" | "import" | null;

export function SkillsLayout({
  selectedId,
  tab = DEFAULT_TAB,
  children,
}: {
  selectedId?: string;
  tab?: SkillTab;
  children?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const setEnabled = useSetSkillEnabled();
  const [search, setSearch] = React.useState("");
  const [overlay, setOverlay] = React.useState<Overlay>(null);

  const list = filterSkills(skills ?? [], search);
  const noSkills = hasNoSkills(skills, { isLoading, isError });
  const openSkill = (id: string) => {
    setOverlay(null);
    router.push(skillHref(id, DEFAULT_TAB));
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: "/skills" }]}>
      {overlay === "create" && <CreateSkillModal onClose={() => setOverlay(null)} onCreated={openSkill} />}
      {overlay === "import" && <ImportSkillModal onClose={() => setOverlay(null)} onImported={openSkill} />}
      <div style={s.frame}>
        <div style={s.column}>
          <div style={s.columnHead}>
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
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => setOverlay("create") },
                  { label: t("page.menu.import"), icon: "Upload", onClick: () => setOverlay("import") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                aria-label={t("page.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {isLoading && (
              <div style={s.skeletons}>
                {LIST_SKELETONS.map((k) => (
                  <Skeleton key={k} height={SKELETON_HEIGHT} />
                ))}
              </div>
            )}
            {isError && !skills && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {hasNoMatch(skills, list) && (
              <div style={s.noMatch}>{t("page.noMatch", { q: search.trim() })}</div>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                href={skillHref(sk.id, tab)}
                onToggle={(enabled) => setEnabled.mutate({ id: sk.id, enabled })}
              />
            ))}
          </div>
        </div>

        <div style={s.pane}>
          {children ??
            (noSkills ? (
              <>
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.create")}
                  onCta={() => setOverlay("create")}
                />
                <div style={s.emptyActions}>
                  <Button kind="ghost" icon="Upload" onClick={() => setOverlay("import")}>
                    {t("page.empty.import")}
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
            ))}
        </div>
      </div>
    </AppShell>
  );
}
