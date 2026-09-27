/* SkillsList — the left panel of /skills: search, the "Add Skill" menu, and one
   SkillCard per skill. Selection and data live in SkillsShell; this renders. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "@/lib/skills";
import { SkillCard } from "../SkillCard";
import { s } from "./styles";

export function SkillsList({
  skills,
  selectedId,
  isLoading,
  isError,
  search,
  onSearch,
  onSelect,
  onToggle,
  onDelete,
  onCreate,
  onImportFile,
  onImportCommunity,
  onRetry,
}: {
  skills: Skill[];
  selectedId?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  onToggle: (skill: Skill, enabled: boolean) => void;
  onDelete: (skill: Skill) => void;
  onCreate: () => void;
  onImportFile: () => void;
  onImportCommunity: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("skills");
  const list = filterSkills(skills, search);

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={240}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
              { divider: true },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: onImportFile },
              { label: t("page.menu.community"), icon: "Globe", onClick: onImportCommunity },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.scroll}>
        {isLoading && (
          <>
            <Skeleton height={104} />
            <div style={{ height: 10 }} />
            <Skeleton height={104} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={onRetry} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={onCreate}
          />
        )}
        {list.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            active={skill.id === selectedId}
            onClick={() => onSelect(skill.id)}
            onToggle={(enabled) => onToggle(skill, enabled)}
            onDelete={() => onDelete(skill)}
          />
        ))}
      </div>
    </div>
  );
}
