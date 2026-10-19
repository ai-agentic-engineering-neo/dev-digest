/* SkillCard — type-tinted icon, name + enabled toggle, description, type +
   source, and a stats footer (agents · pull rate · accept rate). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, TYPE_COLOR } from "../../../../../../components/skill-type-badge";
import { acceptColor, toPct } from "../../../../../../lib/accept-rate";
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
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  const stats = skill.stats;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox(TYPE_COLOR[skill.type])}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {/* <label> names the switch for assistive tech; clicks must not open the editor. */}
        <label onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <span style={s.srOnly}>{t("listItem.enabledLabel", { name: skill.name })}</span>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        {needsVetting(skill) && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      {stats && (
        <div className="mono" style={s.footer}>
          <span>{t("listItem.agents", { count: stats.agents })}</span>
          {stats.pull_rate != null && <span>{t("listItem.pull", { pct: toPct(stats.pull_rate) })}</span>}
          {stats.accept_rate != null && (
            <span style={{ color: acceptColor(stats.accept_rate) }}>
              {t("listItem.accept", { pct: toPct(stats.accept_rate) })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
