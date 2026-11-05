/* /skills — Skills Lab master-detail (Skills designs). Left: search + Add Skill
   (Create → create mode in the panel; Import → ImportSkillModal) + SkillCards
   with stats and a delete icon. Right: "Select a skill" until one is picked,
   then SkillDetail with Config / Preview / Evals / Stats / Versions.
   Selection + tab live in the URL (?id, ?tab, ?new=1). Unsaved
   Config edits are guarded on navigation. The DB is the source of truth. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkillCardStats, useSkillUsage, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { DeleteSkillDialog } from "./_components/DeleteSkillDialog";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SkillCard } from "./_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { DEFAULT_TAB, SKELETON_CARDS, type SkillTab } from "./constants";
import { filterSkills, parseTab } from "./helpers";
import { s } from "./styles";
import { errorMessage } from "@/lib/error-message";

type Target = { id: string | null; tab: SkillTab; create: boolean };

export function SkillsLab() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: usage } = useSkillUsage();
  const { data: cardStats } = useSkillCardStats();
  const update = useUpdateSkill();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [deleting, setDeleting] = React.useState<Skill | null>(null);
  const [importing, setImporting] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const onDirtyChange = React.useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  const all = skills ?? [];
  const list = filterSkills(all, query);
  const creating = search.get("new") === "1";
  const tab = parseTab(search.get("tab"));
  // Nothing is pre-selected: without a valid ?id the panel shows "Select a skill".
  const selected: Skill | null = creating ? null : (all.find((sk) => sk.id === search.get("id")) ?? null);

  const go = (target: Target, { force = false } = {}) => {
    if (!force && dirtyRef.current && !window.confirm(t("detail.unsavedConfirm"))) return;
    dirtyRef.current = false;
    const sp = new URLSearchParams();
    if (target.create) sp.set("new", "1");
    else if (target.id) sp.set("id", target.id);
    if (!target.create && target.tab !== DEFAULT_TAB) sp.set("tab", target.tab);
    const qs = sp.toString();
    router.replace(qs ? `/skills?${qs}` : "/skills");
  };

  // The URL at the moment a delete finishes (not when it started): the user may
  // have picked another skill while the request ran.
  const current = React.useRef({ id: selected?.id ?? null, tab });
  const selectedId = selected?.id ?? null;
  React.useLayoutEffect(() => {
    current.current = { id: selectedId, tab };
  }, [selectedId, tab]);

  // Card trash icon → DeleteSkillDialog. Deleting the open skill clears the
  // selection (its unsaved edits go with it, so no dirty prompt).
  const onCardDeleted = (sk: Skill) => {
    setDeleting(null);
    if (sk.id === current.current.id) go({ id: null, tab: current.current.tab, create: false }, { force: true });
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      {deleting && (
        <DeleteSkillDialog skill={deleting} onClose={() => setDeleting(null)} onDeleted={onCardDeleted} />
      )}
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onImported={(sk) => {
            setImporting(false);
            go({ id: sk.id, tab: "preview", create: false });
          }}
        />
      )}
      <div style={s.layout}>
        <aside style={s.list}>
          <div style={s.listHead}>
            <div style={s.listTitleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={250}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  {
                    label: t("page.menu.create"),
                    icon: "Edit",
                    onClick: () => go({ id: null, tab: "config", create: true }),
                  },
                  { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.cards}>
            {isLoading &&
              Array.from({ length: SKELETON_CARDS }, (_, i) => <Skeleton key={i} height={130} />)}
            {all.length > 0 && list.length === 0 && <p style={s.noMatch}>{t("page.noMatch", { query })}</p>}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                stats={cardStats?.[sk.id]}
                usedBy={usage?.[sk.id] ?? 0}
                active={!creating && sk.id === selected?.id}
                onClick={() => go({ id: sk.id, tab, create: false })}
                onDelete={() => setDeleting(sk)}
                onToggle={(enabled) =>
                  update.mutate(
                    { id: sk.id, patch: { enabled } },
                    { onError: (e) => toast.error(`${t("config.toggleError")}: ${errorMessage(e)}`) },
                  )
                }
              />
            ))}
          </div>
        </aside>

        <section style={s.detail}>
          {isError ? (
            <div style={s.center}>
              <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div style={s.center}>
              <Skeleton height={200} width={480} />
            </div>
          ) : !creating && all.length === 0 ? (
            <div style={s.center}>
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => go({ id: null, tab: "config", create: true })}
              />
            </div>
          ) : !creating && !selected ? (
            <div style={s.center}>
              <EmptyState icon="Sparkles" title={t("page.select.title")} body={t("page.select.body")} />
            </div>
          ) : (
            <SkillDetail
              skill={selected}
              tab={tab}
              onTab={(next) => go({ id: selected?.id ?? null, tab: next, create: creating })}
              onCreated={(sk) => go({ id: sk.id, tab: "config", create: false }, { force: true })}
              onDeleted={() => go({ id: null, tab: "config", create: false }, { force: true })}
              onDirtyChange={onDirtyChange}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}
