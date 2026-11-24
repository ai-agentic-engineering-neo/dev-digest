/* SkillRow — one skill in the agent's Skills tab: drag handle, checkbox, mono
   name, "disabled globally" marker, ↑/↓ buttons (keyboard fallback) and type badge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "@/lib/skill-type";
import { s } from "./styles";

export function SkillRow({
  skill,
  linked,
  canUp,
  canDown,
  dragOver,
  onToggle,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  skill: SkillListItem;
  linked: boolean;
  canUp: boolean;
  canDown: boolean;
  dragOver: boolean;
  onToggle: (on: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("agents");
  const style = SKILL_TYPE_STYLE[skill.type];
  return (
    <div
      data-testid={`skill-row-${skill.name}`}
      draggable={linked}
      onDragStart={(e) => {
        e.dataTransfer?.setData("text/plain", skill.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      style={s.row(linked, dragOver)}
    >
      <span style={s.handle(linked)} title={t("skillsTab.dragHandle", { name: skill.name })} aria-hidden="true">
        <Icon.Menu size={14} />
      </span>
      <div style={s.grow}>
        <Checkbox
          checked={linked}
          onChange={onToggle}
          label={
            <span className="mono" style={s.name}>
              {skill.name}
            </span>
          }
        />
      </div>
      {!skill.enabled && (
        <span title={t("skillsTab.disabledGloballyTitle")}>
          <Badge color="var(--text-muted)">{t("skillsTab.disabledGlobally")}</Badge>
        </span>
      )}
      {linked && (
        <span style={s.arrows}>
          {canUp && <IconBtn icon="ArrowUp" size={26} label={t("skillsTab.moveUp", { name: skill.name })} onClick={() => onMove(-1)} />}
          {canDown && (
            <IconBtn icon="ArrowDown" size={26} label={t("skillsTab.moveDown", { name: skill.name })} onClick={() => onMove(1)} />
          )}
        </span>
      )}
      <Badge color={style.color} bg={style.bg}>
        {t(`skillsTab.type.${skill.type}`)}
      </Badge>
    </div>
  );
}
