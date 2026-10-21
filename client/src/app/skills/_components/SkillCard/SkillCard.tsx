/* SkillCard — one skill in the Skills column: icon chip, mono name and the
   enabled toggle; description; type tag and source; agent count. The open
   surface is a real <button>; the Toggle sits beside it. Deleting happens in
   the editor's Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeTag } from "../../../../components/skill-type-tag";
import { needsVetting } from "../../helpers";
import { SOURCE_ICON } from "./constants";
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
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  return (
    <div style={s.card(!!active, skill.enabled)} data-testid="skill-card">
      <div style={s.headerRow}>
        <span style={s.chip(skill.type)} aria-hidden>
          <Icon.Sparkles size={12} />
        </span>
        <button type="button" onClick={onClick} style={s.openButton} aria-label={skill.name} aria-pressed={!!active}>
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
        </button>
        {onToggle && (
          <span title={t("card.enabledLabel")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </span>
        )}
      </div>
      <button type="button" onClick={onClick} style={s.bodyButton} tabIndex={-1} aria-hidden>
        <div style={s.description}>{skill.description}</div>
        <div style={s.meta}>
          <SkillTypeTag type={skill.type} />
          <span style={s.source}>
            <SourceIcon size={11} />
            {t(`card.source.${skill.source}`)}
          </span>
          {needsVetting(skill) && (
            <span title={t("card.needsVettingTitle")}>
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("card.needsVetting")}
              </Badge>
            </span>
          )}
        </div>
      </button>
      <div style={s.footer}>
        <span>{t("card.agentCount", { count: skill.agent_count })}</span>
      </div>
    </div>
  );
}
