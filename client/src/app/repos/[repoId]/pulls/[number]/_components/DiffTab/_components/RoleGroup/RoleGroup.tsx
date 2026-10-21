/* RoleGroup — one collapsible, sticky-headed group of the Smart Diff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffFocus } from "@/components/diff-viewer";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DEFAULT_COLLAPSED, ROLE_META } from "./constants";
import { s } from "./styles";

interface RoleGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  /** Number of files with at least one open finding. */
  filesWithFindings: number;
  hasReview: boolean;
  findings?: DiffFindingApi;
  commenting?: DiffCommentApi;
  /** A deep link points at a file of this group: open the group (never closes it). */
  forceOpen?: boolean;
  focus?: DiffFocus;
}

export function RoleGroup({ role, files, filesWithFindings, hasReview, findings, commenting, forceOpen, focus }: RoleGroupProps) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(!DEFAULT_COLLAPSED.has(role));
  React.useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div style={s.wrap}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span style={s.square(meta.color)} />
        <span style={s.label}>{t(`smartDiff.${meta.labelKey}`)}</span>
        <span style={s.caption}>{t(`smartDiff.${meta.captionKey}`)}</span>
        {!hasReview ? (
          <span style={s.muted}>{t("smartDiff.reviewNotRun")}</span>
        ) : filesWithFindings > 0 ? (
          <span style={s.counter} aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}>
            ● {filesWithFindings}
          </span>
        ) : null}
        <span style={s.muted}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && <DiffViewer files={files} findings={findings} commenting={commenting} focus={focus} />}
    </div>
  );
}
