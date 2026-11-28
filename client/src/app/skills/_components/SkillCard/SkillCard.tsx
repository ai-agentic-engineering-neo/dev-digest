/* SkillCard — one skill in the Skills list: name, global enabled toggle,
   description, type + source, and the 30-day usage line
   ("3 agents · 71% pull · 74% accept"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillSourceTag, SkillTypeBadge, SKILL_TYPE_COLORS } from "@/components/skill-badges";
import { formatRate } from "@/lib/format-rate";
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
  const c = SKILL_TYPE_COLORS[skill.type];
  const stats = skill.stats;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.();
      }}
      aria-current={active ? "true" : undefined}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox(c.color, c.bg)}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} title={t("card.toggle")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.tagsRow}>
        <SkillTypeBadge type={skill.type} />
        <SkillSourceTag source={skill.source} />
      </div>
      <div style={s.divider} />
      <div className="tnum" style={s.metrics}>
        <span>{t("card.agents", { count: stats?.agents_count ?? 0 })}</span>
        <span>{t("card.pull", { rate: formatRate(stats?.pull_rate) })}</span>
        <span style={stats?.accept_rate != null ? s.accept : undefined}>
          {t("card.accept", { rate: formatRate(stats?.accept_rate) })}
        </span>
      </div>
    </div>
  );
}
