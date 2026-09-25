/* RoleGroup — one collapsible role group in Smart order (server/specs/06-smart-diff.md):
   a sticky header (role label + hint + "● N" finding count per severity, in
   that severity's colour + file count) and,
   when open, a DiffViewer over that group's files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffFindingItem } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";
import type { SeverityCount } from "@/components/findings-hover";
import { ROLE_HINT_KEY, ROLE_LABEL_KEY } from "../../constants";
import { s } from "../../styles";

export function RoleGroup<T extends DiffFindingItem>({
  role,
  files,
  counts,
  defaultCollapsed,
  commenting,
  findingApi,
  fileDefaultOpen,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  counts: SeverityCount[];
  defaultCollapsed: boolean;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi<T>;
  /** Which of the group's file cards start expanded. */
  fileDefaultOpen?: (file: PrFile) => boolean;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const bodyId = React.useId();

  return (
    <div style={s.roleGroup}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} style={s.roleHeader}>
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span aria-hidden style={s.roleDot(role)} />
        <span style={s.roleLabel}>{t(ROLE_LABEL_KEY[role])}</span>
        <span style={s.roleHint}>{t(ROLE_HINT_KEY[role])}</span>
        <span style={s.roleSpacer} />
        {counts.length > 0 && (
          <span style={s.roleCounts}>
            {counts.map(({ severity, count }) => (
              <span
                key={severity}
                title={t("smartDiff.severityCount", { count, severity: severity.toLowerCase() })}
                style={s.roleCount(SEV[severity].c)}
              >
                ● {count}
              </span>
            ))}
          </span>
        )}
        <span style={s.roleFilesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div id={bodyId} style={s.roleBody}>
          <DiffViewer files={files} commenting={commenting} findingApi={findingApi} defaultOpen={fileDefaultOpen} />
        </div>
      )}
    </div>
  );
}
