"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { SkillRowModel } from "../../helpers";
import { SKILL_TYPE_COLOR } from "../../constants";
import { s } from "./styles";

/** Drag-and-drop wiring from the list; `active` = a drag from this list is in progress. */
export interface SkillRowDnd {
  active: boolean;
  isDragging: boolean;
  onStart: () => void;
  onEnd: () => void;
  onDrop: () => void;
}

export interface SkillRowProps {
  row: SkillRowModel;
  /** Reorder (drag + Alt+↑/↓) allowed: false while the filter is non-empty. */
  reorderable: boolean;
  hintId: string;
  dnd: SkillRowDnd;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  rowRef?: React.Ref<HTMLLIElement>;
}

const MOVE_KEYS: Record<string, -1 | 1> = { ArrowUp: -1, ArrowDown: 1 };

/** One skill: drag handle (attached only) · checkbox · name · disabled badge · type badge. */
export function SkillRow({ row, reorderable, hintId, dnd, onToggle, onMove, rowRef }: SkillRowProps) {
  const t = useTranslations("agents");
  const { skill, attached } = row;
  const canMove = attached && reorderable;
  const typeColor = SKILL_TYPE_COLOR[skill.type];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const delta = MOVE_KEYS[e.key];
    if (!e.altKey || !delta || !canMove) return;
    e.preventDefault();
    onMove(delta);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    // Firefox starts a drag only when data is set.
    e.dataTransfer.setData("text/plain", skill.id);
    dnd.onStart();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dnd.active || !canMove) return;
    e.preventDefault(); // marks this row as a valid drop target
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dnd.active || !canMove) return;
    e.preventDefault();
    dnd.onDrop();
  };

  return (
    <li
      ref={rowRef}
      tabIndex={0}
      aria-label={skill.name}
      aria-describedby={hintId}
      aria-keyshortcuts={canMove ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      draggable={canMove}
      onKeyDown={handleKeyDown}
      onDragStart={canMove ? handleDragStart : undefined}
      onDragEnd={dnd.onEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={s.row({ attached, dragging: dnd.isDragging, dimmed: !skill.enabled })}
    >
      <span
        aria-hidden="true"
        title={attached ? (reorderable ? t("skills.dragHandle") : t("skills.dragDisabled")) : undefined}
        style={s.handle(canMove, attached)}
      >
        <Icon.Menu size={14} />
      </span>
      <Checkbox checked={attached} onChange={onToggle} label={<span className="mono" style={s.name}>{skill.name}</span>} />
      <span style={s.badges}>
        {!skill.enabled && (
          <span title={t("skills.disabledTitle")}>
            <Badge color="var(--text-muted)">{t("skills.disabled")}</Badge>
          </span>
        )}
        <Badge color={typeColor.color} bg={typeColor.bg}>
          {t(`skills.types.${skill.type}`)}
        </Badge>
      </span>
    </li>
  );
}
