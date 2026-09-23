/* SkillsView — /skills: a grid of skill cards with search + type filter and
   the Add Skill menu (create / import). A card opens the editor at /skills/:id
   (skill list sidebar + tabs, like the agents screen). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Chip, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkillStatsSummary } from "@/lib/hooks";
import { SKILL_TYPES } from "../../constants";
import { skillHref } from "../../helpers";
import { AddSkillMenu } from "../AddSkillMenu";
import { SkillCard } from "../SkillCard";
import { filterSkills, statsById } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: stats } = useSkillStatsSummary();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState<SkillType | null>(null);

  const all = skills ?? [];
  const list = filterSkills(all, search, type);
  const statsMap = statsById(stats);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <AddSkillMenu />
        </div>

        <div style={s.toolbar}>
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
          <Chip active={type === null} onClick={() => setType(null)}>
            {t("filter.all")}
          </Chip>
          {SKILL_TYPES.map((ty) => (
            <Chip key={ty} active={type === ty} onClick={() => setType(ty)}>
              {t(`type.${ty}`)}
            </Chip>
          ))}
          {skills && (
            <span className="tnum" style={s.count}>
              {t("page.count", { shown: list.length, total: all.length })}
            </span>
          )}
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && (
          <ErrorState
            title={tc("states.error")}
            body={t("page.loadError")}
            onRetry={() => refetch()}
            retryLabel={tc("actions.retry")}
          />
        )}
        {skills && all.length === 0 && <EmptyState icon="Sparkles" title={t("page.empty.title")} body={t("page.empty.body")} />}
        {skills && all.length > 0 && list.length === 0 && (
          <EmptyState icon="Search" title={t("page.noMatch.title")} body={t("page.noMatch.body")} />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard key={sk.id} skill={sk} stats={statsMap.get(sk.id)} onOpen={(id) => router.push(skillHref(id))} />
            ))}
          </div>
        )}
      </div>

    </AppShell>
  );
}
