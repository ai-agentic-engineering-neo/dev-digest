/* /skills — Skills list (Skills Lab). Grid of SkillCards (name, type,
   description, enabled toggle); a click opens the preview drawer; "Add Skill"
   offers Create / Import. The DB is the source of truth. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useSkillUsage, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillPreviewDrawer } from "./_components/SkillPreviewDrawer";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SKELETON_CARDS } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

// The edit dialog keeps only the id: the skill is looked up from the live list on
// every render, so a refetch (toggle, version bump) never leaves it diffing a stale copy.
type Dialog = { kind: "create" } | { kind: "edit"; skillId: string } | { kind: "import" } | null;

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: usage } = useSkillUsage();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);

  const all = skills ?? [];
  const list = filterSkills(all, search);
  const preview = all.find((sk) => sk.id === previewId) ?? null;
  const editing: Skill | undefined =
    dialog?.kind === "edit" ? all.find((sk) => sk.id === dialog.skillId) : undefined;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {preview && (
        <SkillPreviewDrawer
          skill={preview}
          usedBy={usage?.[preview.id] ?? 0}
          onClose={() => setPreviewId(null)}
          onEdit={() => setDialog({ kind: "edit", skillId: preview.id })}
        />
      )}
      {dialog?.kind === "create" && <SkillEditorModal onClose={() => setDialog(null)} />}
      {editing && <SkillEditorModal skill={editing} onClose={() => setDialog(null)} />}
      {dialog?.kind === "import" && (
        <ImportSkillModal
          onClose={() => setDialog(null)}
          onImported={(sk) => {
            setDialog(null);
            setPreviewId(sk.id);
          }}
        />
      )}

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
            width={250}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setDialog({ kind: "create" }) },
              { label: t("page.menu.import"), icon: "Upload", onClick: () => setDialog({ kind: "import" }) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={120} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setDialog({ kind: "create" })}
          />
        )}
        {all.length > 0 && list.length === 0 && <p style={s.noMatch}>{t("page.noMatch", { query: search })}</p>}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                usedBy={usage?.[sk.id] ?? 0}
                active={sk.id === previewId}
                onClick={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
