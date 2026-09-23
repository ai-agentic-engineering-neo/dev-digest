/* SkillRow — one skill in the agent's Skills tab: drag handle (linked rows
   only), checkbox, name, type badge and a muted hint when the skill is
   disabled globally. SortableSkillRow wires it to dnd-kit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { s } from "./styles";

interface RowProps {
  skill: Skill;
  checked: boolean;
  onCheck: (on: boolean) => void;
  /** Rendered in the handle slot (linked rows); unlinked rows keep the gap. */
  handle?: React.ReactNode;
}

export const SkillRow = React.forwardRef<HTMLLIElement, RowProps & { style?: React.CSSProperties }>(
  function SkillRow({ skill, checked, onCheck, handle, style }, ref) {
    const t = useTranslations("agents");
    return (
      <li ref={ref} style={{ ...s.row(checked), ...style }} data-testid="agent-skill-row" data-skill-id={skill.id}>
        <span style={s.handleSlot}>{handle}</span>
        <Checkbox checked={checked} onChange={onCheck} label={<span className="mono" style={s.name}>{skill.name}</span>} />
        <SkillTypeBadge type={skill.type} />
        {!skill.enabled && (
          <span style={s.disabled} title={t("skills.disabledTitle")}>
            {t("skills.disabledHint")}
          </span>
        )}
        <span style={s.description}>{skill.description}</span>
      </li>
    );
  },
);

/** A linked row in the sortable list; `disabled` (filter on, or the skill is
 *  disabled globally) turns dragging off. */
export function SortableSkillRow({ disabled, ...props }: Omit<RowProps, "handle"> & { disabled: boolean }) {
  const t = useTranslations("agents");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.skill.id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? s.dragging : null),
  };
  return (
    <SkillRow
      ref={setNodeRef}
      style={style}
      {...props}
      handle={
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={t("skills.dragHandle", { name: props.skill.name })}
          title={props.skill.enabled ? undefined : t("skills.dragDisabled")}
          style={s.handle(disabled)}
        >
          <Icon.Menu size={14} />
        </button>
      }
    />
  );
}
