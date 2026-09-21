/* SkillRow — one skill in the /skills list and in the /skills/[id] side panel:
   icon, mono name, enabled toggle, type + source badges, and the
   "{n} agents · {x}% pull · {y}% accept" metrics line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle, SkillTypeTag } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SOURCE_META } from "./constants";
import { formatPercent, needsVetting } from "./helpers";
import { s } from "./styles";

export function SkillRow({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const source = SOURCE_META[skill.source];
  const none = t("list.metrics.none");
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} title={t("list.toggleAria", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("list.noDescription")}</div>
      <div style={s.tagRow}>
        <SkillTypeTag type={skill.type} label={t(`listItem.type.${skill.type}`)} />
        <Badge color="var(--text-secondary)" bg="transparent" icon={source.icon} style={{ padding: "2px 0" }}>
          {t(source.labelKey)}
        </Badge>
        {needsVetting(skill.source) && (
          <span style={s.vetting} title={t("listItem.vettingTitle")}>
            {t("listItem.needsVetting")}
          </span>
        )}
      </div>
      <div style={s.metrics}>
        <span>{t("list.metrics.usedBy", { count: skill.used_by })}</span>
        <span aria-hidden>·</span>
        <span>{t("list.metrics.pull", { value: formatPercent(skill.pull_rate) ?? none })}</span>
        <span aria-hidden>·</span>
        <span style={skill.accept_rate == null ? undefined : s.accept}>
          {t("list.metrics.accept", { value: formatPercent(skill.accept_rate) ?? none })}
        </span>
      </div>
    </div>
  );
}
