/* ContextDocRow — one repo doc in the agent's Context tab (N2b): drag handle (attached rows only;
   drag, or Arrow Up / Arrow Down), the attach checkbox, file name + folder, the source badge, and a
   Preview button — or, for a doc gone from the synced commit, a "missing" badge with Detach. The
   row itself is only a drop target (never draggable). Every control's accessible name includes the
   path. Drag state and the attached order live in ContextTab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { DocSourceBadge } from "@/components/doc-source-badge";
import { splitDocPath } from "@/lib/context-docs";
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

export interface ContextDocRowProps {
  row: ContextRow;
  drag: ContextDocRowDrag;
  onToggle: () => void;
  /** Arrow Up (-1) / Arrow Down (1) on the drag handle. */
  onKeyMove: (dir: -1 | 1) => void;
  onPreview: () => void;
  /** True once a keyboard-moved row sits at its target position: focus its handle again (the keyed
      DOM node moved). Focus happens once per true transition, not on every parent render. */
  focusHandle: boolean;
  onHandleFocused: () => void;
}

export function ContextDocRow({
  row,
  drag,
  onToggle,
  onKeyMove,
  onPreview,
  focusHandle,
  onHandleFocused,
}: ContextDocRowProps) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const { path, attached, status } = row;
  const missing = status === "missing";
  const { name, folder } = splitDocPath(path);
  const handleRef = React.useRef<HTMLButtonElement>(null);
  // the parent passes a new inline callback each render; read it through a ref so it is not a dep
  const onFocusedRef = React.useRef(onHandleFocused);
  React.useEffect(() => {
    onFocusedRef.current = onHandleFocused;
  });

  React.useEffect(() => {
    if (!focusHandle) return;
    handleRef.current?.focus();
    onFocusedRef.current();
  }, [focusHandle]);

  return (
    <div
      role="listitem"
      data-testid={`context-row-${path}`}
      style={s.row(attached, drag.over)}
      onDragOver={(e) => {
        if (drag.onOver()) e.preventDefault();
      }}
      onDragLeave={drag.onLeave}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop();
      }}
    >
      {attached ? (
        <button
          ref={handleRef}
          type="button"
          draggable
          aria-label={t("contextTab.dragHandle", { path })}
          title={t("contextTab.dragHandle", { path })}
          style={s.handle}
          onDragStart={(e) => {
            drag.onStart();
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={drag.onEnd}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              onKeyMove(e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span aria-hidden style={s.handleSpacer} />
      )}

      {missing ? (
        <span aria-hidden style={s.checkboxSpacer} />
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={attached}
          aria-label={t("contextTab.attachLabel", { path })}
          onClick={onToggle}
          style={s.checkbox(attached)}
        >
          {attached && <Icon.Check size={11} />}
        </button>
      )}

      <span style={s.nameBlock} title={path}>
        <span className="mono" style={s.name(attached)}>
          {name}
        </span>
        {folder && (
          <span className="mono" style={s.folder}>
            {folder}
          </span>
        )}
      </span>

      <span style={s.spacer} />

      {row.source && <DocSourceBadge source={row.source} label={tc(`source.${row.source}`)} />}

      {missing ? (
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
      ) : (
        <button
          type="button"
          style={s.textBtn}
          aria-label={t("contextTab.previewLabel", { path })}
          onClick={onPreview}
        >
          <Icon.Eye size={13} />
          {t("contextTab.preview")}
        </button>
      )}
    </div>
  );
}
