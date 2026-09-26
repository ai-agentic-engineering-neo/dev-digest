/* SkillPanel — side preview of one skill with an inline edit mode and delete. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, IconBtn, Markdown, SectionLabel, Skeleton } from "@devdigest/ui";
import { useDeleteSkill, useSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillTypeTag } from "../../../../components/skill-type-tag";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { SkillForm, toSkillFormValue, type SkillFormValue } from "../SkillForm";
import { needsVetting } from "../../helpers";
import { s } from "./styles";

export function SkillPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  // Rendered with `key={id}` by SkillsView, so switching skills remounts the
  // panel and drops edit mode without an effect.
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<SkillFormValue | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const startEdit = () => {
    if (!skill) return;
    setForm(toSkillFormValue(skill));
    setEditing(true);
  };
  const save = () => {
    if (!skill || !form) return;
    update.mutate(
      { id: skill.id, patch: form },
      {
        onSuccess: (data) => {
          setEditing(false);
          toast.success(t("panel.savedToast", { version: data.version }));
        },
      },
    );
  };
  const remove = () => {
    if (!skill) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(t("panel.deletedToast"));
        router.replace("/skills");
      },
    });
  };

  return (
    <aside style={s.panel} aria-label={skill?.name ?? "skill"}>
      {isLoading && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={20} width={200} />
          <Skeleton height={160} />
        </div>
      )}
      {(isError || (!isLoading && !skill)) && (
        <ErrorState
          title={t("panel.notFound.title")}
          body={error instanceof Error ? error.message : t("panel.notFound.body")}
          onRetry={() => refetch()}
        />
      )}
      {skill && confirming && (
        <ConfirmDialog
          title={t("confirm.title", { name: skill.name })}
          body={t("confirm.body")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          pending={del.isPending}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
      {skill && (
        <>
          <div style={s.header}>
            <span className="mono" style={s.name}>
              {skill.name}
            </span>
            <IconBtn icon="X" label={t("panel.close")} onClick={onClose} />
          </div>
          <div style={s.meta}>
            <SkillTypeTag type={skill.type} />
            <Badge mono>{t("card.version", { version: skill.version })}</Badge>
            <Badge>{t(`card.source.${skill.source}`)}</Badge>
            <Badge>{t("card.agentCount", { count: skill.agent_count })}</Badge>
            {needsVetting(skill) && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("card.needsVetting")}
              </Badge>
            )}
            {!skill.enabled && <Badge color="var(--text-muted)">{t("card.disabled")}</Badge>}
            <span style={s.spacer} />
            {!editing ? (
              <div style={s.actions}>
                <Button kind="primary" size="sm" icon="ExternalLink" onClick={() => router.push(`/skills/${skill.id}`)}>
                  {t("panel.open")}
                </Button>
                <Button kind="secondary" size="sm" icon="Edit" onClick={startEdit}>
                  {t("panel.edit")}
                </Button>
                <IconBtn icon="Trash" label={t("panel.delete")} danger onClick={() => setConfirming(true)} />
              </div>
            ) : (
              <div style={s.actions}>
                <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                  {t("panel.cancel")}
                </Button>
                <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={update.isPending}>
                  {update.isPending ? t("panel.saving") : t("panel.save")}
                </Button>
              </div>
            )}
          </div>
          <div style={s.body}>
            {editing && form ? (
              <SkillForm value={form} onChange={setForm} />
            ) : (
              <>
                {skill.source !== "manual" && <div style={s.notice}>{t("panel.importedNotice")}</div>}
                <div>
                  <SectionLabel>{t("panel.descriptionLabel")}</SectionLabel>
                  <div style={s.description}>{skill.description || "—"}</div>
                </div>
                <div>
                  <SectionLabel>{t("panel.bodyLabel")}</SectionLabel>
                  <div style={s.markdown}>
                    <Markdown>{skill.body}</Markdown>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
