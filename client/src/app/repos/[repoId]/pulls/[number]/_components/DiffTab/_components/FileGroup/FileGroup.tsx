/* FileGroup — one role's collapsible section: header (chevron, role square,
   label + description, per-severity chips, "N files") and, when open, its
   files rendered through the shared DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge } from "@devdigest/ui";
import type { FindingRecord, PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { CHIP_SEVERITIES, ROLE_META, SEVERITY_FILES_KEY } from "../../constants";
import { filesPerSeverity } from "../../helpers";
import { s, chevronFor } from "./styles";

export function FileGroup({
  role,
  files,
  byFile,
  commenting,
  findings,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  byFile: Map<string, FindingRecord[]>;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(meta.defaultOpen);
  const counts = filesPerSeverity(files, byFile);

  return (
    <div style={s.group}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.roleSquare(meta.color)} />
        <span style={s.roleLabel}>{t(meta.labelKey)}</span>
        <span style={s.roleDesc}>{t(meta.descKey)}</span>
        <span style={s.chips}>
          {CHIP_SEVERITIES.filter((sev) => counts[sev] > 0).map((sev) => (
            <span key={sev} role="img" aria-label={t(SEVERITY_FILES_KEY[sev], { count: counts[sev] })}>
              <SeverityBadge severity={sev} compact count={counts[sev]} />
            </span>
          ))}
          <span style={s.fileCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
        </span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
