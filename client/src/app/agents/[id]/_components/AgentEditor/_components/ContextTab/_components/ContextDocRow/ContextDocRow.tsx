/* ContextDocRow — one repo doc in the agent's Context tab: drag handle + ↑/↓ (attached rows), the
   attach switch, path + source/tokens, a "missing" badge with Detach for docs gone from the synced
   commit, Preview, and the prompt position #N. Every control's accessible name includes the path.
   Drag state lives in ContextTab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { ContextRow } from "../../helpers";
import { s } from "./styles";

export interface ContextDocRowDrag {
  over: boolean;
  onStart: () => void;
  /** Return true to accept the drop target (only attached rows while dragging). */
  onOver: () => boolean;
  onLeave: () => void;
  onDrop: () => void;
  onEnd: () => void;
}

export function ContextDocRow({
  row,
  attachedCount,
  drag,
  onToggle,
  onMove,
  onPreview,
}: {
  row: ContextRow;
  attachedCount: number;
  drag: ContextDocRowDrag;
  onToggle: () => void;
  onMove: (to: number) => void;
  onPreview: () => void;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const { path, attached, position, status } = row;
  const missing = status === "missing";

  return (
    <div
      role="listitem"
      data-testid={`context-row-${path}`}
      style={s.row(attached, drag.over)}
      draggable={attached}
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
        role="img"
        aria-label={attached ? t("contextTab.dragHandle", { path }) : undefined}
        aria-hidden={attached ? undefined : true}
        title={attached ? t("contextTab.dragHandle", { path }) : undefined}
        style={s.handle(attached)}
      >
        {attached && <Icon.Menu size={14} />}
      </span>
      {!missing && (
        <span style={s.toggle}>
          <Toggle on={attached} onChange={onToggle} size={14} label={t("contextTab.attachLabel", { path })} />
        </span>
      )}
      <div style={s.nameBlock}>
        <span className="mono" style={s.path(attached)} title={path}>
          {path}
        </span>
        {!missing && (
          <span style={s.meta}>
            {row.source ? tc(`source.${row.source}`) : ""}
            {row.tokens != null ? ` · ${tc("meta.tokens", { count: row.tokens })}` : ""}
          </span>
        )}
      </div>
      {missing && (
        <>
          <span title={t("contextTab.missingHint")}>
            <Badge color="var(--crit)" bg="var(--crit-bg)">
              {t("contextTab.missing")}
            </Badge>
          </span>
          <button type="button" style={s.textBtn} aria-label={t("contextTab.detachLabel", { path })} onClick={onToggle}>
            {t("contextTab.detach")}
          </button>
        </>
      )}
      {!missing && (
        <button type="button" style={s.iconBtn} aria-label={t("contextTab.previewLabel", { path })} title={t("contextTab.preview")} onClick={onPreview}>
          <Icon.Eye size={14} />
        </button>
      )}
      {attached && (
        <div style={s.arrows}>
          <button
            type="button"
            style={s.iconBtn}
            aria-label={t("contextTab.moveUp", { path })}
            disabled={position === 0}
            onClick={() => onMove(position - 1)}
          >
            <Icon.ArrowUp size={13} />
          </button>
          <button
            type="button"
            style={s.iconBtn}
            aria-label={t("contextTab.moveDown", { path })}
            disabled={position === attachedCount - 1}
            onClick={() => onMove(position + 1)}
          >
            <Icon.ArrowDown size={13} />
          </button>
        </div>
      )}
      <span className="mono" style={s.position}>
        {attached ? t("contextTab.position", { n: position + 1 }) : ""}
      </span>
    </div>
  );
}
