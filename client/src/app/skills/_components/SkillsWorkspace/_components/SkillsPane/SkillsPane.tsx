/* SkillsPane — left column: "Skills" + Add Skill ▾, search, skill cards. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useSkillsWorkspace } from "../../SkillsWorkspace";
import { filterSkills } from "../../helpers";
import { SkillCard } from "../SkillCard";
import { s } from "./styles";

export function SkillsPane({ activeId, tab = "config" }: { activeId?: string; tab?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const workspace = useSkillsWorkspace();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills ?? [], search);

  return (
    <>
      <div style={s.head}>
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
            { label: t("page.createSkill"), icon: "Edit", onClick: () => workspace.open("create") },
            { label: t("page.importSkill"), icon: "Upload", onClick: () => workspace.open("import") },
            { divider: true },
            { label: t("page.menu.community"), icon: "Globe", onClick: () => workspace.open("community") },
          ]}
        />
      </div>
      {(skills ?? []).length > 0 && (
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
      )}
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={130} />
            <Skeleton height={130} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {(skills ?? []).length > 0 && list.length === 0 && (
          <div style={s.noMatch}>{t("page.noMatch", { query: search })}</div>
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </>
  );
}
