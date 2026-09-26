"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { NO_DATA } from "@/lib/format";
import { TYPE_COLOR, TYPE_ICON, SOURCE_ICON, UNTRUSTED_SOURCES } from "@/lib/skill-display";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useConfirm } from "@/components/confirm-dialog";
import { formatPercent } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const { confirm, dialog } = useConfirm();
  const TypeIcon = Icon[TYPE_ICON[skill.type]];
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  const color = TYPE_COLOR[skill.type];
  const needsVetting = UNTRUSTED_SOURCES.includes(skill.source) && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <TypeIcon size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            confirm(
              {
                title: t("deleteConfirm.title"),
                body: t("deleteConfirm.body", { name: skill.name }),
                confirmLabel: t("deleteConfirm.confirm"),
              },
              () => del.mutate(skill.id, { onSuccess: () => onDeleted?.() }),
            );
          }}
          disabled={del.isPending}
          title={t("deleteConfirm.action")}
          aria-label={t("deleteConfirm.action")}
          style={s.deleteButton(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={color} bg={color + "1a"}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <span style={s.sourceLabel}>
          <SourceIcon size={12} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      <div style={s.footer}>
        <span style={s.agentChip}>
          <Icon.Settings size={11} />
          {skill.agent_count == null ? NO_DATA : t("page.footer.agents", { count: skill.agent_count })}
        </span>
        <span>{t("page.footer.pull", { value: formatPercent(skill.pull_rate) })}</span>
        <span>{t("page.footer.accept", { value: formatPercent(skill.accept_rate) })}</span>
      </div>
      {dialog}
    </div>
  );
}
