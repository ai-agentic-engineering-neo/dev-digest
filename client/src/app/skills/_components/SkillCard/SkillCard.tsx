/* SkillCard — one row of the Skills list: name, type chip, enabled toggle,
   delete, description, "source · vN" and the attached-agent count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeChip } from "../../../../components/skill-type-chip";
import { isImported } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)} data-testid="skill-card">
      <div style={s.headerRow}>
        <span style={s.name} title={skill.name}>
          {skill.name}
        </span>
        <SkillTypeChip type={skill.type} />
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title={t("card.deleteTitle")}
            aria-label={t("card.deleteTitle")}
            style={s.deleteBtn(!!deleting)}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
      <div style={s.description} title={skill.description}>
        {skill.description || "—"}
      </div>
      <div style={s.meta}>
        {t("card.meta", { source: t(`source.${skill.source}`), version: skill.version })}
      </div>
      <div style={s.footer}>
        <Badge icon="Cpu">{t("card.agentCount", { count: skill.agent_count ?? 0 })}</Badge>
        {isImported(skill) && !skill.enabled && (
          <span title={t("card.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
