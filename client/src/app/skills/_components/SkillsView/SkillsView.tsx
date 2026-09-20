/* /skills — master–detail: searchable skill list (left) + selected skill with Config / Preview / Stats (right). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills } from "@/lib/hooks/skills";
import { SkillDetail, parseSkillTab, type SkillTab } from "../SkillDetail";
import { SkillEditorDrawer, type EditorTabKey } from "./_components/SkillEditorDrawer";
import { SkillList } from "./_components/SkillList";
import { buildSkillsHref, resolveSelectedId } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [drawer, setDrawer] = React.useState<EditorTabKey | null>(null);

  const list = skills ?? [];
  const selectedId = resolveSelectedId(list, params.get("id"));
  const selected = list.find((sk) => sk.id === selectedId) ?? null;
  const tab = parseSkillTab(params.get("tab"));

  const go = (id: string | null, nextTab: SkillTab) => router.replace(buildSkillsHref(id, nextTab));

  const afterDelete = (deletedId: string) => go(list.find((sk) => sk.id !== deletedId)?.id ?? null, tab);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {drawer && (
        <SkillEditorDrawer initialTab={drawer} onClose={() => setDrawer(null)} onCreated={(sk) => go(sk.id, "config")} />
      )}
      <div style={s.layout}>
        <SkillList
          skills={list}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          selectedId={selectedId}
          onSelect={(id) => go(id, tab)}
          onAdd={setDrawer}
        />
        <main style={s.detail}>
          {isLoading && (
            <div style={s.detailSkeleton}>
              <Skeleton height={36} />
              <Skeleton height={240} />
            </div>
          )}
          {!isLoading && !isError && list.length === 0 && (
            <div style={s.center}>
              <EmptyState
                icon="Zap"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setDrawer("file")}
              />
            </div>
          )}
          {selected && (
            <SkillDetail
              skill={selected}
              tab={tab}
              onTabChange={(next) => go(selected.id, next)}
              onDeleted={afterDelete}
            />
          )}
        </main>
      </div>
    </AppShell>
  );
}
