/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";

/** A deep-link target: that file opens, and its line (when given) is highlighted while `highlight` is true. */
export interface DiffFocus {
  path: string;
  line: number | null;
  highlight: boolean;
}

export function DiffViewer({
  files,
  commenting,
  findings,
  defaultOpen,
  focus,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  defaultOpen?: boolean;
  focus?: DiffFocus;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => {
        const focused = focus?.path === f.path;
        return (
          <FileCard
            key={f.path}
            file={f}
            commenting={commenting}
            findings={findings}
            defaultOpen={defaultOpen}
            forceOpen={focused}
            highlightLine={focused && focus.highlight ? focus.line : null}
          />
        );
      })}
    </div>
  );
}
