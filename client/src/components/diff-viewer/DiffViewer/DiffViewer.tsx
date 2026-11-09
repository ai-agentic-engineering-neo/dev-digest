/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import type { LineRange } from "../focus";

export function DiffViewer({
  files,
  commenting,
  focusPath,
  focusLines = null,
  focusMissingNote = null,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Path of the file to open and scroll to (deep link from the PR brief). */
  focusPath?: string | null;
  /** New-side line range to highlight and focus inside the focused file. */
  focusLines?: LineRange | null;
  /** Ready-made note shown when the target line is not part of the diff. */
  focusMissingNote?: string | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => {
        const focused = f.path === focusPath;
        return (
          <FileCard
            key={i}
            file={f}
            commenting={commenting}
            focused={focused}
            focusLines={focused ? focusLines : null}
            focusMissingNote={focused ? focusMissingNote : null}
          />
        );
      })}
    </div>
  );
}
