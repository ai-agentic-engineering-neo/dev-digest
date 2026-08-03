"use client";

import React from "react";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import type { SkillRowModel } from "./helpers";
import { s } from "./styles";

/** Type badge colours — the four `SkillType` members. */
const TYPE_COLOR: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** Drag/keyboard reordering wiring for one row. */
export interface RowDrag {
  /** This row is the one being dragged. */
  active: boolean;
  onStart: () => void;
  onEnd: () => void;
  /** Something was dropped onto this row. */
  onDrop: () => void;
  /** Keyboard nudge: -1 up, +1 down. */
  onMove: (delta: number) => void;
}

/**
 * One skill row: drag handle, checkbox (the per-agent gate), mono name, type
 * badge. Dragging is hand-rolled on the HTML5 drag events — no DnD dependency —
 * with ArrowUp/ArrowDown on the handle as the keyboard equivalent, since native
 * drag is unreachable without a pointer.
 */
export function SkillRow({
  row,
  drag,
  reorderLabel,
  onToggle,
}: {
  row: SkillRowModel;
  drag: RowDrag;
  reorderLabel: string;
  onToggle: (next: boolean) => void;
}) {
  const badge = TYPE_COLOR[row.skill.type];
  return (
    <div
      style={s.row(drag.active)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop();
      }}
    >
      <button
        type="button"
        draggable
        aria-label={reorderLabel}
        title={reorderLabel}
        onDragStart={drag.onStart}
        onDragEnd={drag.onEnd}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          drag.onMove(e.key === "ArrowUp" ? -1 : 1);
        }}
        style={s.handle}
      >
        <Icon.Menu size={14} />
      </button>
      <Checkbox
        checked={row.enabled}
        onChange={onToggle}
        label={
          <span className="mono" style={s.name}>
            {row.skill.name}
          </span>
        }
      />
      <span style={s.right}>
        <Badge color={badge.color} bg={badge.bg}>
          {row.skill.type}
        </Badge>
      </span>
    </div>
  );
}
