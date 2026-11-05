/* SkillPreviewDrawer — side preview of one skill: type, source, version,
   description (its interface), the rendered markdown body, and actions
   (enable toggle, edit, delete). Imported skills carry a trust notice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { isImportedSkill } from "../../helpers";
import { s } from "./styles";

export function SkillPreviewDrawer({
  skill,
  usedBy,
  onClose,
  onEdit,
}: {
  skill: Skill;
  usedBy: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const remove = () => {
    if (!window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("preview.deleted"));
        onClose();
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Drawer
      width={640}
      title={<span className="mono">{skill.name}</span>}
      subtitle={t("card.usedBy", { count: usedBy })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <div style={s.enabledRow}>
            <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} />
            <span>{skill.enabled ? t("preview.enabled") : t("preview.disabled")}</span>
          </div>
          <div style={s.spacer} />
          <Button kind="ghost" icon="Trash" onClick={remove} disabled={del.isPending}>
            {t("preview.delete")}
          </Button>
          <Button kind="primary" icon="Edit" onClick={onEdit}>
            {t("preview.edit")}
          </Button>
        </div>
      }
    >
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <Badge color="var(--text-secondary)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        <span style={s.muted}>{t("preview.source", { source: t(`preview.sources.${skill.source}`) })}</span>
      </div>

      {isImportedSkill(skill) && (
        <div style={s.notice} role="note">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <div style={s.label}>{t("preview.description")}</div>
      <p style={s.description}>{skill.description}</p>

      <div style={s.label}>{t("preview.body")}</div>
      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </Drawer>
  );
}
