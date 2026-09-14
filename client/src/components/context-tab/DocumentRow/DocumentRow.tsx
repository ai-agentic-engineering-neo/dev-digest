"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { ContextTabNamespace, DocumentRowModel } from "../helpers";
import { s } from "../styles";

/** Drag/keyboard reordering wiring for one row — same shape as SkillsTab's
 *  `RowDrag`, plus `position`/`total` so the handle's label can announce
 *  where in the (attached-only) drop-priority order this row currently sits. */
export interface RowDrag {
  active: boolean;
  onStart: () => void;
  onEnd: () => void;
  onDrop: () => void;
  /** Keyboard nudge: -1 up, +1 down. */
  onMove: (delta: number) => void;
  /** 1-based position among ATTACHED rows, 0 when this row isn't attached. */
  position: number;
  total: number;
}

/**
 * One document row: drag handle, checkbox (attach/detach), mono path,
 * doc-type chip, token count, a "missing" badge when the attachment's file no
 * longer resolves (AC-26), and — when the path still resolves in the
 * discovery catalog (`row.docType != null`) — a view-only preview toggle so a
 * document's content can be checked before attaching it, without leaving the
 * editor. The row is never removed for `missing`, only marked. Dragging is
 * hand-rolled HTML5 drag, matching SkillRow; ArrowUp/ArrowDown on the handle
 * is the keyboard equivalent.
 *
 * Entity-agnostic aside from `namespace`, which the shared `ContextTab`
 * passes through so `context.*` strings resolve against the right i18n
 * message file (`messages/en/agents.json` vs `messages/en/skills.json`).
 */
export function DocumentRow({
  namespace,
  row,
  drag,
  onToggle,
  previewOpen,
  onPreviewToggle,
}: {
  namespace: ContextTabNamespace;
  row: DocumentRowModel;
  drag: RowDrag;
  onToggle: (next: boolean) => void;
  /** Whether this row's preview panel is currently expanded. Ignored when
   *  `onPreviewToggle` is undefined (nothing to preview). */
  previewOpen?: boolean;
  /** Undefined when `row.docType` is null — a since-deleted/moved attachment
   *  has no file left to preview (AC-26), so no toggle is offered for it. */
  onPreviewToggle?: () => void;
}) {
  const t = useTranslations(namespace);
  const reorderLabel =
    drag.position > 0
      ? t("context.reorderPositioned", { path: row.path, position: drag.position, total: drag.total })
      : t("context.reorder", { path: row.path });
  const previewLabel = t("context.preview", { path: row.path });

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
        checked={row.attached}
        onChange={onToggle}
        label={
          <span className="mono" style={s.path}>
            {row.path}
          </span>
        }
      />
      <span style={s.right}>
        {row.missing && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("context.missing")}
          </Badge>
        )}
        {row.docType && <Badge color="var(--text-secondary)">{row.docType}</Badge>}
        <span className="tnum" style={s.tokens}>
          {t("context.tokens", { count: row.tokens })}
        </span>
        {onPreviewToggle && (
          <button
            type="button"
            onClick={onPreviewToggle}
            aria-expanded={previewOpen ?? false}
            aria-label={previewLabel}
            title={previewLabel}
            style={s.previewButton}
          >
            <Icon.Eye size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
