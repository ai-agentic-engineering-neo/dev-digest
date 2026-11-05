/* SkillCard — name, type, description, "imported" marker, linked-agent count
   and the global enabled toggle. A click opens the preview drawer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { isImportedSkill } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  usedBy,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  usedBy: number;
  active?: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={s.card(!!active, skill.enabled)}
      data-testid={`skill-card-${skill.name}`}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={t("card.toggleLabel")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        {isImportedSkill(skill) && (
          <span title={t("card.importedTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.imported")}
            </Badge>
          </span>
        )}
        <span style={s.usage}>{t("card.usedBy", { count: usedBy })}</span>
      </div>
    </div>
  );
}
