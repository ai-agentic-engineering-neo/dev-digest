/* SkillCard — list-column card (Skills design): name, global enabled toggle,
   one-line description, type badge, source label, and the stats row
   "N agents · X% pull · Y% accept". A click selects the skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillCardStats } from "@/lib/types";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { formatPct, isImportedSkill } from "../../helpers";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  stats,
  usedBy,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  stats?: SkillCardStats;
  /** Linked-agent count fallback while card stats load. */
  usedBy: number;
  active?: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  const imported = isImportedSkill(skill);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!active}
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
        <div style={s.iconBox(imported)}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={t("card.toggleLabel")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} label={t("card.toggleLabel")} />
        </div>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <span style={s.source(imported)} title={imported ? t("card.importedTitle") : undefined}>
          <SourceIcon size={12} />
          {t(`card.sources.${skill.source}`)}
        </span>
      </div>
      <div style={s.statsRow}>
        <span>{t("card.agents", { count: stats?.agents ?? usedBy })}</span>
        <span>{t("card.pull", { pct: formatPct(stats?.pull_rate) })}</span>
        <span style={s.accept(stats?.accept_rate != null)}>
          {t("card.accept", { pct: formatPct(stats?.accept_rate) })}
        </span>
      </div>
    </div>
  );
}
