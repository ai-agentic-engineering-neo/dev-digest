/* SkillCard — name, type tag, description, version, source, agent count,
   enabled toggle and a Delete button. The card's open surface is a real
   <button>; Toggle and Delete sit beside it, and the confirm dialog is owned
   by the grid so it is never nested inside a button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, IconBtn, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeTag } from "../../../../components/skill-type-tag";
import { needsVetting } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <div style={s.card(!!active, skill.enabled)} data-testid="skill-card">
      <button type="button" onClick={onClick} style={s.openButton} aria-label={skill.name}>
        <div style={s.headerRow}>
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
          <SkillTypeTag type={skill.type} />
        </div>
        <div style={s.description}>{skill.description}</div>
      </button>
      <div style={s.footer}>
        <span className="mono">{t("card.version", { version: skill.version })}</span>
        <span>·</span>
        <span>{t(`card.source.${skill.source}`)}</span>
        <span>·</span>
        <span>{t("card.agentCount", { count: skill.agent_count })}</span>
        {needsVetting(skill) && (
          <span title={t("card.needsVettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.needsVetting")}
            </Badge>
          </span>
        )}
        <span style={s.spacer} />
        {onToggle && (
          <span title={t("card.enabledLabel")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </span>
        )}
        {onDelete && <IconBtn icon="Trash" size={24} label={t("card.deleteTitle")} danger onClick={onDelete} />}
      </div>
    </div>
  );
}
