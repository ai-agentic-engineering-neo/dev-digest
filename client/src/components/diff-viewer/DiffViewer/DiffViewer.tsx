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

export function DiffViewer({
  files,
  commenting,
  focusTarget,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** specs/11-why-risk-brief.md AC-39/Q7 — the file matching `focusTarget.file`
   *  opens and scrolls to `line` (or its own header when `line` is null);
   *  every other file gets no scroll target. */
  focusTarget?: { file: string; line: number | null; n: number } | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          scrollTarget={
            focusTarget && focusTarget.file === f.path ? { line: focusTarget.line, nonce: focusTarget.n } : undefined
          }
        />
      ))}
    </div>
  );
}
