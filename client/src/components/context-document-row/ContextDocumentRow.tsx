/* ContextDocumentRow — one Markdown document of a repo. Read-only (selectable,
   "used by N agents / M skills") in the showcase; with the `attach` prop it is
   a row of the agent/skill Context tab (drag handle, checkbox, name + folder,
   kind badge, preview eye, reorder arrows). The path is rendered as text,
   never as HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import type { SpecKind } from "@devdigest/shared";
import { TokenBadge } from "@/components/token-badge";
import { KIND_COLOR, splitPath } from "./constants";
import { s } from "./styles";

export interface ContextRowAttach {
  checked: boolean;
  onToggle: (on: boolean) => void;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  /** Reorder arrows, shown for checked rows only. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export interface ContextDocumentRowProps {
  path: string;
  kind?: SpecKind | null;
  tokens?: number | null;
  missing?: boolean;
  tooLarge?: boolean;
  /** A local override replaces the repository text. */
  modified?: boolean;
  usage?: { agents: number; skills: number };
  selected?: boolean;
  attach?: ContextRowAttach;
  onSelect?: () => void;
  onPreview?: () => void;
}

export function ContextDocumentRow({ path, kind, tokens, missing, tooLarge, modified, usage, selected, attach, onSelect, onPreview }: ContextDocumentRowProps) {
  const t = useTranslations("context");
  const kindColor = KIND_COLOR[kind ?? "none"];
  const kindBadge = (
    <Badge color={kindColor.c} bg={kindColor.bg} mono>
      {t(`row.kind.${kind ?? "none"}`)}
    </Badge>
  );
  const flags = (
    <>
      {modified && <span role="img" aria-label={t("row.modifiedMarker")} title={t("row.modifiedMarker")} style={s.modifiedDot} data-testid="context-row-modified" />}
      {missing && (
        <span title={t("row.missingTitle")}>
          <Badge color="var(--crit)" bg="var(--crit-bg)">
            {t("row.missing")}
          </Badge>
        </span>
      )}
      {tooLarge && (
        <span title={t("row.tooLargeTitle")}>
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("row.tooLarge")}
          </Badge>
        </span>
      )}
    </>
  );

  if (!attach) {
    // read-only row: one button selects it for the preview
    return (
      <button type="button" data-testid="context-doc-row" style={s.row(false, !!selected, false, !!onSelect)} onClick={onSelect} aria-pressed={selected}>
        <span className="mono" style={s.path} title={path}>
          {path}
        </span>
        {flags}
        {kindBadge}
        {typeof tokens === "number" && <TokenBadge count={tokens} />}
        {usage && <span style={s.usage}>{t("row.usedBy", { agents: usage.agents, skills: usage.skills })}</span>}
      </button>
    );
  }

  const { folder, name } = splitPath(path);
  return (
    <div
      role="listitem"
      data-testid="context-doc-row"
      style={s.row(attach.checked, false, attach.dragging, false)}
      draggable={attach.draggable}
      onDragStart={attach.onDragStart}
      onDragOver={attach.onDragOver}
      onDrop={attach.onDrop}
      onDragEnd={attach.onDragEnd}
    >
      <span style={s.grip(attach.draggable)} aria-hidden>
        <Icon.Menu size={14} />
      </span>
      <span title={t("row.attach", { path })} aria-disabled={tooLarge && !attach.checked}>
        {/* a too-large file cannot be attached: the box stays inert until it is checked (then it can be unchecked) */}
        <Checkbox checked={attach.checked} onChange={tooLarge && !attach.checked ? undefined : attach.onToggle} />
      </span>
      <span style={s.pathCell} title={path}>
        <span className="mono" style={s.name}>
          {name}
        </span>
        {folder && (
          <span className="mono" style={s.folder}>
            {folder}
          </span>
        )}
      </span>
      {flags}
      {typeof tokens === "number" && <TokenBadge count={tokens} />}
      {kindBadge}
      {onPreview && (
        <Button kind="ghost" size="sm" icon="Eye" onClick={onPreview} aria-label={t("row.previewLabel", { path })}>
          {t("row.preview")}
        </Button>
      )}
      {attach.checked && (
        <span style={s.arrows}>
          <IconBtn icon="ArrowUp" size={24} label={t("row.moveUp", { path })} onClick={attach.onMoveUp} />
          <IconBtn icon="ArrowDown" size={24} label={t("row.moveDown", { path })} onClick={attach.onMoveDown} />
        </span>
      )}
    </div>
  );
}
