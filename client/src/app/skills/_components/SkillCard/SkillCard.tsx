/* SkillCard — type-colored icon, name, enabled toggle, description snippet,
   type badge, source badge, and an agents_count stat row. Mirrors AgentCard.
   Reused both in the /skills list and as the left rail in the Skill Editor. */
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
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={color} bg={color + "1a"}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)" icon={sourceIcon(skill.source)}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {t("card.agentsCount", { count: skill.agents_count })}
        </Badge>
      </div>
    </div>
  );
}
