/* SkillRow — one workspace skill in the agent's Skills tab: drag handle
   (linked rows only), the link switch, name + description (plain text — the
   switch is the only control), imported / disabled-globally markers, ↑/↓ and
   the prompt position #N for linked rows, and the type badge. Every control
   has a tooltip or an accessible name. Drag state lives in SkillsTab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { s } from "./styles";

export interface SkillRowDrag {
  /** True while another linked row is dragged over this one. */
  over: boolean;
  onStart: () => void;
  /** Return true to accept the drop target (only linked rows while dragging). */
  onOver: () => boolean;
  onLeave: () => void;
  onDrop: () => void;
  onEnd: () => void;
}

export function SkillRow({
  skill,
  linked,
  position,
  linkedCount,
  drag,
  onToggle,
  onMove,
}: {
  skill: Skill;
  linked: boolean;
  /** Index in prompt order (meaningful only when linked). */
  position: number;
  linkedCount: number;
  drag: SkillRowDrag;
  onToggle: () => void;
  /** Move this linked skill to the given prompt index. */
  onMove: (to: number) => void;
}) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const imported = skill.source === "community" || skill.source === "imported_url";

  return (
    <div
      role="listitem"
      data-testid={`skill-row-${skill.name}`}
      style={s.row(linked, drag.over)}
      draggable={linked}
      onDragStart={(e) => {
        drag.onStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (drag.onOver()) e.preventDefault();
      }}
      onDragLeave={drag.onLeave}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop();
      }}
      onDragEnd={drag.onEnd}
    >
      <span
        style={s.handle(linked)}
        title={linked ? t("skills.dragHandle", { name: skill.name }) : undefined}
        aria-hidden
      >
        {linked && <Icon.Menu size={14} />}
      </span>
      <span title={t("skills.attachTitle")} style={s.toggle}>
        <Toggle on={linked} onChange={onToggle} size={14} label={t("skills.attach", { name: skill.name })} />
      </span>
      {/* Not clickable: the switch is the only control, so selecting /
          double-clicking the name never saves. */}
      <div style={{ ...s.nameBlock, ...(skill.enabled ? {} : s.muted) }}>
        <span className="mono" style={s.name(linked)}>
          {skill.name}
        </span>
        <span style={s.description}>{skill.description || t("skills.noDescription")}</span>
      </div>
      {imported && (
        <span title={t("skills.importedTitle")}>
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("skills.imported")}
          </Badge>
        </span>
      )}
      {!skill.enabled && (
        <span title={t("skills.disabledGloballyTitle")}>
          <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>
        </span>
      )}
      {linked && (
        <div style={s.arrows}>
          <button
            type="button"
            style={s.arrowBtn}
            aria-label={t("skills.moveUp", { name: skill.name })}
            title={t("skills.moveUpTitle")}
            disabled={position === 0}
            onClick={() => onMove(position - 1)}
          >
            <Icon.ArrowUp size={13} />
          </button>
          <button
            type="button"
            style={s.arrowBtn}
            aria-label={t("skills.moveDown", { name: skill.name })}
            title={t("skills.moveDownTitle")}
            disabled={position === linkedCount - 1}
            onClick={() => onMove(position + 1)}
          >
            <Icon.ArrowDown size={13} />
          </button>
        </div>
      )}
      <span title={t("skills.typeTitle")}>
        <SkillTypeBadge type={skill.type} label={tSkills(`type.${skill.type}`)} />
      </span>
      <span
        className="mono"
        style={s.position}
        title={linked ? t("skills.positionTitle", { position: position + 1 }) : undefined}
      >
        {linked ? t("skills.position", { position: position + 1 }) : ""}
      </span>
    </div>
  );
}
