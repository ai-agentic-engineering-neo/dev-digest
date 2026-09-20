/* SkillList — left pane: heading, Add Skill menu, search, and one card per skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { getErrorMessage, useSkillsStats, useUpdateSkill } from "@/lib/hooks/skills";
import { filterSkills } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import type { EditorTabKey } from "../SkillEditorDrawer";
import { SkillCard } from "./_components/SkillCard";
import { s } from "./styles";

interface Props {
  skills: Skill[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (tab: EditorTabKey) => void;
}

export function SkillList({ skills, isLoading, isError, onRetry, selectedId, onSelect, onAdd }: Props) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const { data: stats } = useSkillsStats();
  const [search, setSearch] = React.useState("");

  const visible = filterSkills(skills, search);
  const statsById = new Map((stats ?? []).map((row) => [row.skill_id, row]));

  const toggle = (id: string, enabled: boolean) =>
    update.mutate(
      { id, patch: { enabled } },
      { onError: (err) => toast.error(getErrorMessage(err, t("page.updateFailed"))) },
    );

  return (
    <aside style={s.pane} aria-label={t("page.heading")}>
      <div style={s.top}>
        <div style={s.header}>
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
              { label: t("page.menu.create"), icon: "Edit", onClick: () => onAdd("create") },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => onAdd("file") },
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
          <>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={onRetry} />}
        {!isLoading && !isError && skills.length > 0 && visible.length === 0 && (
          <EmptyState icon="Search" title={t("page.noMatch.title")} body={t("page.noMatch.body")} />
        )}
        {visible.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            stats={stats ? (statsById.get(sk.id) ?? null) : undefined}
            active={sk.id === selectedId}
            onOpen={() => onSelect(sk.id)}
            onToggle={(enabled) => toggle(sk.id, enabled)}
          />
        ))}
      </div>
    </aside>
  );
}
