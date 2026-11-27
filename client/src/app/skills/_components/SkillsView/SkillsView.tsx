/* /skills — the skills as a card grid (same layout as /agents): title + search +
   Add Skill ▾ on top, one SkillCard per skill. A card opens /skills/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { DEFAULT_SKILL_TAB } from "../constants";
import { filterSkills, skillHref } from "../helpers";
import { AddSkillMenu } from "../AddSkillMenu";
import { CreateSkillModal } from "../CreateSkillModal";
import { DeleteSkillDialog } from "../DeleteSkillDialog";
import { SkillCard } from "../SkillCard";
import { SKELETON_COUNT } from "./constants";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // An id, not a snapshot: the dialog shows the skill as the cache has it now.
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const visible = filterSkills(skills ?? [], query);
  const deleting = deletingId ? skills?.find((sk) => sk.id === deletingId) : undefined;
  const closeDelete = () => setDeletingId(null);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {deleting && <DeleteSkillDialog skill={deleting} onClose={closeDelete} onDeleted={closeDelete} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <AddSkillMenu onCreate={() => setCreating(true)} />
        </div>

        {isLoading && (
          <div style={s.grid}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={130} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && skills?.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setCreating(true)}
          />
        )}
        {!!skills?.length && visible.length === 0 && (
          <p style={s.noMatch}>{t("page.noMatch", { query: query.trim() })}</p>
        )}
        {visible.length > 0 && (
          <div style={s.grid}>
            {visible.map((skill) => {
              const href = skillHref(skill.id, DEFAULT_SKILL_TAB);
              return (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  href={href}
                  onSelect={() => router.push(href)}
                  onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                  onDelete={() => setDeletingId(skill.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
