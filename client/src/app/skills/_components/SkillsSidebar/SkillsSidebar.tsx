/* SkillsSidebar — left column of the Skills page: title, "Add Skill" menu
   (create / import), search, and the skill cards. */
"use client";

import React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsSidebar({
  query,
  activeId,
  onSelect,
  onCreate,
  onImport,
}: {
  query: UseQueryResult<Skill[]>;
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const visible = filterSkills(query.data ?? [], search);

  return (
    <div style={s.sidebar}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h1 style={s.title}>{t("page.heading")}</h1>
          <Dropdown
            width={230}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
              { label: t("page.menu.import"), icon: "Upload", onClick: onImport },
            ]}
          />
        </div>
        <TextInput value={search} onChange={setSearch} placeholder={t("page.searchPlaceholder")} />
      </div>
      <div style={s.list}>
        {query.isLoading ? (
          <div style={s.skeletons}>
            <Skeleton height={96} />
            <Skeleton height={96} />
            <Skeleton height={96} />
          </div>
        ) : query.isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => query.refetch()} />
        ) : (
          <>
            {visible.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === activeId}
                onClick={() => onSelect(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
            {search && visible.length === 0 && (
              <div style={s.noMatch}>{t("page.noMatch", { query: search })}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
