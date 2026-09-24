/* RoleGroup — one collapsible role group in Smart order (server/specs/06-smart-diff.md):
   a sticky header (role label + hint + "● N" flagged count + file count) and,
   when open, a DiffViewer over that group's files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffFindingItem } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_HINT_KEY, ROLE_LABEL_KEY } from "../../constants";
import { s } from "../../styles";

export function RoleGroup<T extends DiffFindingItem>({
  role,
  files,
  flaggedCount,
  defaultCollapsed,
  commenting,
  findingApi,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  flaggedCount: number;
  defaultCollapsed: boolean;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi<T>;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const bodyId = React.useId();

  return (
    <div style={s.roleGroup}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} style={s.roleHeader(open)}>
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span aria-hidden style={s.roleDot(role)} />
        <span style={s.roleLabel}>{t(ROLE_LABEL_KEY[role])}</span>
        <span style={s.roleHint}>{t(ROLE_HINT_KEY[role])}</span>
        <span style={s.roleSpacer} />
        {flaggedCount > 0 && <span style={s.roleFlagged}>● {flaggedCount}</span>}
        <span style={s.roleFilesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div id={bodyId} style={s.roleBody}>
          <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />
        </div>
      )}
    </div>
  );
}
