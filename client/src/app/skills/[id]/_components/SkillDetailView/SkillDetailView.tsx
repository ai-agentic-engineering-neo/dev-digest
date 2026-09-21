/* /skills/:id — the skill detail page. A rail of every skill on the left, and
   the selected one on the right under three tabs: Config (edit it), Preview
   (see it as the model does) and Versions (see how it got here). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Badge, Button, ErrorState, Icon, Skeleton, Tabs, Toggle } from "@devdigest/ui";
import { AppShell } from "../../../../../components/app-shell";
import { ConfirmDialog } from "../../../../../components/confirm-dialog";
import { useDeleteSkill, useSkill, useSkills, useUpdateSkill } from "../../../../../lib/hooks/skills";
import { SkillCard, isUntrustedSource, typeColor } from "../../../_components/SkillCard";
import { AddSkillMenu, useAddSkillFlow } from "../../../_components/AddSkillMenu";
import { SkillConfigTab } from "../SkillConfigTab";
import { SkillPreviewTab } from "../SkillPreviewTab";
import { SkillVersionsTab } from "../SkillVersionsTab";
import { TABS, DEFAULT_TAB } from "./constants";
import { draftFromSkill, isDirty, type SkillDraft } from "./helpers";
import { s } from "./styles";

export function SkillDetailView({
  id,
  tab,
  onTab,
}: {
  id: string;
  tab: string;
  onTab: (tab: string) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  /**
   * `null` means "clean — show the server's copy". A draft is only created once
   * the user types, so an external change (a restore on the Versions tab) shows
   * up immediately instead of being masked by a stale mirror of the old body.
   */
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  // Holds the skill being deleted, not a boolean: the rail can start a delete
  // for a skill other than the one currently open.
  const [pendingDelete, setPendingDelete] = React.useState<Skill | null>(null);
  const addFlow = useAddSkillFlow((sk) => router.push(`/skills/${sk.id}`));
  // A draft belongs to one skill; moving to another must not carry edits over.
  React.useEffect(() => setDraft(null), [id]);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={t("detail.loadError")}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  const effective = skill ? (draft ?? draftFromSkill(skill)) : null;
  const dirty = !!skill && !!draft && isDirty(draft, skill);

  const save = async () => {
    if (!skill || !draft) return;
    await update.mutateAsync({ id: skill.id, patch: draft });
    setDraft(null);
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const wasOpen = pendingDelete.id === id;
    await del.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
    // Deleting some other skill just drops it out of the rail; deleting the one
    // on screen leaves nothing to show, so fall back to the library.
    if (wasOpen) router.push("/skills");
  };

  return (
    <AppShell crumb={crumb}>
      {addFlow.modals}
      {pendingDelete && (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { name: pendingDelete.name })}
          confirmLabel={del.isPending ? t("delete.deleting") : t("delete.confirm")}
          cancelLabel={t("delete.cancel")}
          pending={del.isPending}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      <div style={s.shell}>
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <h1 style={s.sidebarTitle}>{t("detail.sidebarHeading")}</h1>
            <AddSkillMenu flow={addFlow} />
          </div>
          <div style={s.sidebarBack}>
            <Button kind="ghost" size="sm" onClick={() => router.push("/skills")}>
              {t("detail.back")}
            </Button>
          </div>
          <div style={s.sidebarList}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => setPendingDelete(sk)}
              />
            ))}
          </div>
        </div>

        {isLoading || !skill || !effective ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.header}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 className="mono" style={s.title}>
                {skill.name}
              </h1>
              <span className="mono" style={{ color: typeColor(skill.type), fontSize: 11.5 }}>
                {t(`listItem.type.${skill.type}`)}
              </span>
              <Badge color="var(--text-muted)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              <Badge color="var(--text-muted)">
                {t("detail.usedBy", { count: skill.agent_count ?? 0 })}
              </Badge>

              <div style={s.headerActions}>
                <div style={s.toggleWrap}>
                  <span style={s.toggleLabel}>
                    {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
                  </span>
                  <Toggle
                    on={skill.enabled}
                    onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                    size={14}
                  />
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Trash"
                  onClick={() => setPendingDelete(skill)}
                  disabled={del.isPending}
                >
                  {t("preview.delete")}
                </Button>
              </div>
            </div>

            {/* An untrusted body is delimiter-wrapped in the prompt, but the
                person deciding whether to enable it needs to know that here. */}
            {isUntrustedSource(skill.source) && (
              <div style={s.untrustedNotice}>
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0, color: "var(--warn)" }} />
                <span>{t("preview.untrustedNotice")}</span>
              </div>
            )}

            <div style={s.tabsWrap}>
              <Tabs
                tabs={TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
                value={tab}
                onChange={onTab}
              />
            </div>

            <div style={s.content}>
              {tab === "preview" && <SkillPreviewTab body={effective.body} />}
              {tab === "versions" && <SkillVersionsTab skill={skill} />}
              {(tab === DEFAULT_TAB || !TABS.some((tb) => tb.key === tab)) && (
                <SkillConfigTab
                  skill={skill}
                  draft={effective}
                  dirty={dirty}
                  saving={update.isPending}
                  onChange={setDraft}
                  onSave={save}
                  onRevert={() => setDraft(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
