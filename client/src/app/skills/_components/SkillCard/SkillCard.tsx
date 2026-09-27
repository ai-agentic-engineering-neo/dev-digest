/* SkillCard — one skill in the list: name, type, source, enabled toggle and how
   many agents load it. The toggle is the global switch: turning it off removes
   the skill from every agent's prompt without unlinking it anywhere. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isThirdParty, typeColor } from "../../helpers";
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
  /** Asks to delete; the parent confirms and performs it — the card stays presentational. */
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  const color = typeColor(skill.type);
  const thirdParty = isThirdParty(skill.source);

  return (
    // A real control, not a clickable div: selecting a skill is the primary
    // action of this list, and it has to be reachable by keyboard.
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onClick?.();
      }}
      style={s.card(!!active, skill.enabled)}
    >
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
        {onDelete && (
          // Its own click must not also select the card.
          <div onClick={(e) => e.stopPropagation()}>
            <IconBtn icon="Trash" label={t("listItem.delete")} onClick={onDelete} />
          </div>
        )}
      </div>

      <div style={s.description}>
        {skill.description || t("listItem.noDescription")}
      </div>

      <div style={s.metaRow}>
        <Badge color={color} bg="var(--bg-hover)">
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge
          color="var(--text-muted)"
          icon={thirdParty ? "Globe" : skill.source === "extracted" ? "Wrench" : "Edit"}
        >
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        {thirdParty && !skill.enabled && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>

      <div style={s.footerRow}>
        <Icon.Cpu size={12} />
        <span>{t("listItem.agentCount", { count: skill.agent_count })}</span>
        <span style={{ marginLeft: "auto" }} className="mono">
          {t("detail.version", { version: skill.version })}
        </span>
      </div>
    </div>
  );
}
