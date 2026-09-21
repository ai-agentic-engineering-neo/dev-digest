"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Icon, SkillTypeTag } from "@devdigest/ui";
import type { SkillRow } from "./helpers";
import { s } from "./styles";

export interface SortableSkillRowProps {
  row: SkillRow;
  /** True while a filter is active: reordering a filtered subset would be ambiguous. */
  dragDisabled: boolean;
  onToggle: (id: string) => void;
}

/** One draggable skill row: grip handle (the only drag activator), checkbox, name, type tag. */
export function SortableSkillRow({ row, dragDisabled, onToggle }: SortableSkillRowProps) {
  const t = useTranslations("agents");
  const { skill, linked } = row;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    ...s.row,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : skill.enabled ? 1 : 0.55,
    boxShadow: isDragging ? "var(--shadow-drawer)" : undefined,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`skill-row-${skill.id}`}
      title={skill.enabled ? undefined : t("skills.disabledTitle")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("skills.dragHandle", { name: skill.name })}
        title={dragDisabled ? t("skills.dragDisabledTitle") : undefined}
        style={{ ...s.handle, cursor: dragDisabled ? "not-allowed" : isDragging ? "grabbing" : "grab" }}
      >
        <Icon.Menu size={16} />
      </button>
      <Checkbox
        checked={linked}
        onChange={() => onToggle(skill.id)}
        label={<span className="mono" style={s.name}>{skill.name}</span>}
      />
      {!skill.enabled && <span style={s.disabledNote}>{t("skills.disabledNote")}</span>}
      <span style={s.spacer}>
        <SkillTypeTag type={skill.type} />
      </span>
    </div>
  );
}
