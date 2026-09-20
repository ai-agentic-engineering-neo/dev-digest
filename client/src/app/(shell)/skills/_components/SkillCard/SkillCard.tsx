/* SkillCard — type-coloured icon tile, mono name, enabled toggle, type chip
   and source label. Mirrors agents/_components/AgentCard/AgentCard.tsx. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { sourceIcon, typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const color = typeColor(skill.type);
  const SourceIcon = Icon[sourceIcon(skill.source)];
  const needsVetting = skill.source !== "manual";

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
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
            <Badge icon="AlertTriangle" color="var(--text-muted)">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
