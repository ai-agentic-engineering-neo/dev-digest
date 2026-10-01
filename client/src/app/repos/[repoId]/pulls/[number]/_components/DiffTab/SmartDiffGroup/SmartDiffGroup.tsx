"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DEFAULT_COLLAPSED_ROLES, ROLE_META } from "./constants";
import { s } from "./styles";

interface SmartDiffGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  flaggedCount: number;
  findings: DiffFindingApi;
  commenting: DiffCommentApi;
}

/** One role's collapsible slice of the diff; docs/boilerplate start collapsed. */
export function SmartDiffGroup({ role, files, flaggedCount, findings, commenting }: SmartDiffGroupProps) {
  const t = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState(!DEFAULT_COLLAPSED_ROLES.includes(role));
  const meta = ROLE_META[role];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.wrap}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={s.header}>
        <Chevron size={14} aria-hidden />
        <span aria-hidden style={{ ...s.square, background: meta.color }} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.description}>{t(meta.descriptionKey)}</span>
        {flaggedCount > 0 && (
          <span style={s.flagged} aria-label={t("filesWithFindings", { count: flaggedCount })}>
            <span aria-hidden style={s.dot} />
            {flaggedCount}
          </span>
        )}
        <span style={s.count}>{t("filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <DiffViewer files={files} findings={findings} commenting={commenting} />
        </div>
      )}
    </div>
  );
}
