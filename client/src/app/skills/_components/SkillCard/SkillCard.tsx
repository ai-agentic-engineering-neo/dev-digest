/* SkillCard — one skill in the Skills grid: name, type, description, source,
   and the global enabled toggle. Clicking the card opens the side preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isUntrustedSource, typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Omitted where deleting would be a surprise, e.g. the detail page rail. */
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  const untrusted = isUntrustedSource(skill.source);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name} title={skill.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              // The card itself navigates; deleting must not also open the skill.
              e.stopPropagation();
              onDelete();
            }}
            title={t("card.deleteTitle", { name: skill.name })}
            aria-label={t("card.deleteTitle", { name: skill.name })}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>

      <div style={s.description}>{skill.description || t("card.noDescription")}</div>

      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(typeColor(skill.type))}>
          {t(`listItem.type.${skill.type}`)}
        </span>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {untrusted && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>

      {/* Version and reach: "how far has this drifted" and "who would I break
          by editing it" are the two questions you ask before opening a skill. */}
      <div style={s.statsRow}>
        <span className="mono" style={s.version}>
          {t("preview.version", { version: skill.version })}
        </span>
        <span style={s.statsDot}>·</span>
        <span className="tnum">{t("card.agentCount", { count: skill.agent_count ?? 0 })}</span>
      </div>
    </div>
  );
}
