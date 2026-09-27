/* SkillsShell — the /skills layout: the skill list on the left, whichever page
   is active on the right (nothing selected, or /skills/:id). It lives in the
   route's LAYOUT so that moving between skills swaps only the right pane: the
   list, its search text and its scroll position stay mounted.

   It owns everything the list starts: selection, the enabled toggle, creation,
   import, and deletion with its confirmation. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillsList } from "../SkillsList";
import { AddSkillDrawer } from "../AddSkillDrawer";
import { CreateSkillModal } from "../CreateSkillModal";
import { skillHref } from "../../helpers";
import { s } from "./styles";

export function SkillsShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importTab, setImportTab] = React.useState<"file" | "community" | null>(null);
  const [deleting, setDeleting] = React.useState<Skill | null>(null);

  const selectedId = params.id ? decodeURIComponent(params.id) : null;
  // Switching skills keeps the tab you were on: comparing two skills' Preview
  // should not bounce you back to Config each time.
  const currentTab = search.get("tab");

  const open = (id: string, tab: string | null = currentTab) => router.push(skillHref(id, tab));

  const toggle = (skill: Skill, enabled: boolean) =>
    update.mutate({ id: skill.id, patch: { enabled } });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && (
        <CreateSkillModal
          onClose={() => setCreating(false)}
          onCreated={(skill) => open(skill.id, "config")}
        />
      )}
      {importTab && (
        <AddSkillDrawer
          initialTab={importTab}
          onClose={() => setImportTab(null)}
          onImported={(skill) => open(skill.id, "config")}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("detail.deleteTitle")}
          body={t("detail.deleteConfirm", { name: deleting.name })}
          confirmLabel={t("detail.delete")}
          busy={del.isPending}
          error={del.error}
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                // Only leave the page when the DELETED skill is the open one —
                // deleting a different card must not close what you are reading.
                if (deleting.id === selectedId) router.push("/skills");
                setDeleting(null);
              },
            })
          }
          onCancel={() => {
            del.reset();
            setDeleting(null);
          }}
        />
      )}

      <div style={s.page}>
        <SkillsList
          skills={skills ?? []}
          selectedId={selectedId}
          isLoading={isLoading}
          isError={isError}
          search={query}
          onSearch={setQuery}
          onSelect={(id) => open(id)}
          onToggle={toggle}
          onDelete={setDeleting}
          onCreate={() => setCreating(true)}
          onImportFile={() => setImportTab("file")}
          onImportCommunity={() => setImportTab("community")}
          onRetry={() => refetch()}
        />
        <div style={s.pane}>{children}</div>
      </div>
    </AppShell>
  );
}
