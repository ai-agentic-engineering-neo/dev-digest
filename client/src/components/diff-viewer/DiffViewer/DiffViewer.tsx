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
import { dedupeKeys } from "@/lib/stable-keys";

/** React key per file: its path, which identifies the file within a PR (GitHub
 *  lists each filename once), so a FileCard's open/collapsed state follows the
 *  file when the list is reordered or filtered. pr_files has no DB uniqueness on
 *  (pr_id, path), so a repeated path gets an occurrence suffix instead of
 *  producing a duplicate key. */
function fileKeys(files: PrFile[]): string[] {
  return dedupeKeys(files.map((f) => f.path));
}

export function DiffViewer({
  files,
  commenting,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  const keys = fileKeys(files);
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={keys[i]} file={f} commenting={commenting} />
      ))}
    </div>
  );
}
