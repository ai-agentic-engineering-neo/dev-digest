/* /skills — Skills library. Card grid + search + Add (create / import). Clicking
   a card opens the skill panel on the right (split layout): Config, Preview and
   Versioning tabs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillPanel } from "./_components/SkillPanel";
import { SkillEditorModal } from "@/components/skill-editor-modal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

type Modal = "none" | "create" | "import";

export function SkillsView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<Modal>("none");

  const list = filterSkills(skills ?? [], search);
  const selected = (skills ?? []).find((sk) => sk.id === selectedId) ?? null;
  const close = () => setModal("none");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {modal === "create" && <SkillEditorModal onClose={close} />}
      {modal === "import" && <ImportSkillModal onClose={close} />}
      <div style={s.split}>
        <div style={s.main}>
          <div style={s.page}>
            <div style={s.header}>
              <div style={s.headerText}>
                <h1 style={s.h1}>{t("page.heading")}</h1>
                <p style={s.subtitle}>{t("page.subtitle")}</p>
              </div>
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
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => setModal("create") },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setModal("import") },
                ]}
              />
            </div>

            {isLoading && (
              <div style={s.grid}>
                <Skeleton height={120} />
                <Skeleton height={120} />
                <Skeleton height={120} />
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && (skills ?? []).length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setModal("create")}
              />
            )}
            {!isLoading && !isError && (skills ?? []).length > 0 && list.length === 0 && (
              <div style={s.noMatch}>{t("page.noMatch")}</div>
            )}
            {list.length > 0 && (
              <div style={s.grid}>
                {list.map((sk) => (
                  <SkillCard
                    key={sk.id}
                    skill={sk}
                    active={sk.id === selectedId}
                    onClick={() => setSelectedId(sk.id)}
                    onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                    onDeleted={() => sk.id === selectedId && setSelectedId(null)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {selected && (
          <aside style={s.aside}>
            <SkillPanel key={selected.id} skill={selected} onClose={() => setSelectedId(null)} />
          </aside>
        )}
      </div>
    </AppShell>
  );
}
