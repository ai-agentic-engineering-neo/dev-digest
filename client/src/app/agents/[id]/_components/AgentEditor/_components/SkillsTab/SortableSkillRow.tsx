"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@devdigest/ui";
import { SkillRowContent } from "./SkillRowContent";
import type { SkillRow } from "./helpers";
import { s } from "./styles";

export interface SortableSkillRowProps {
  row: SkillRow;
  /** True while a filter is active: reordering a filtered subset would be ambiguous. */
  dragDisabled: boolean;
  onToggle: (id: string) => void;
}

/** One draggable row of the Enabled group: the grip handle is the only drag activator. */
export function SortableSkillRow({ row, dragDisabled, onToggle }: SortableSkillRowProps) {
  const t = useTranslations("agents");
  const { skill } = row;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    ...s.row({ flagged: skill.injection_detected, dimmed: !skill.enabled && !isDragging }),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    boxShadow: isDragging ? "var(--shadow-drawer)" : undefined,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };

  const handle = (
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
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`skill-row-${skill.id}`}
      title={skill.enabled ? undefined : t("skills.disabledTitle")}
    >
      <SkillRowContent row={row} onToggle={onToggle} handle={handle} />
    </div>
  );
}
