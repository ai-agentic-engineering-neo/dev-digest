/* SkillCard — name, type tag, description, source/version, enabled toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeTag } from "../../../../components/skill-type-tag";
import { needsVetting } from "../../helpers";
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
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={skill.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(!!active, skill.enabled)}
      data-testid="skill-card"
    >
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <SkillTypeTag type={skill.type} />
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.footer}>
        <span className="mono">{t("card.version", { version: skill.version })}</span>
        <span>·</span>
        <span>{t(`card.source.${skill.source}`)}</span>
        {needsVetting(skill) && (
          <span title={t("card.needsVettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.needsVetting")}
            </Badge>
          </span>
        )}
        <span style={s.spacer} />
        {onToggle && (
          <span onClick={(e) => e.stopPropagation()} title={t("card.enabledLabel")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </span>
        )}
      </div>
    </div>
  );
}
