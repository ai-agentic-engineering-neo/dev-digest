/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingKey, partitionFindings, topSeverity, type DiffFindingApi, type DiffFindingItem } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnmatchedFindings } from "../UnmatchedFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard<T extends DiffFindingItem>({
  file,
  commenting,
  findingApi,
  defaultOpen,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi<T>;
  /** Overrides the AUTO_EXPAND_MAX_LINES rule; followed live until the user toggles the card. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  // null until the user clicks the header, so a caller's default that changes
  // after mount (findings arriving) still opens or closes the card.
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null);
  const open =
    openOverride ?? defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES;
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // This file's findings, split into ones a rendered line can anchor vs.
  // "unmatched" (server/specs/06-smart-diff.md) — the dot uses the flagged
  // set, not this partition, so it stays lit even while collapsed.
  const { matched: matchedFindings, unmatched: unmatchedFindings } = React.useMemo(() => {
    if (!findingApi) return { matched: new Map<string, T[]>(), unmatched: [] as T[] };
    return partitionFindings(findingApi.items, file.path, lines);
  }, [findingApi, file.path, lines]);
  const flagged = findingApi?.flagged.has(file.path) ?? false;
  const dotSeverity = flagged
    ? topSeverity(findingApi!.items.filter((i) => i.file === file.path))
    : null;

  const findingsForLine = (ln: Line): T[] => {
    if (matchedFindings.size === 0 || ln.newNo == null) return [];
    return matchedFindings.get(findingKey(ln.newNo)) ?? [];
  };

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpenOverride(!open)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {dotSeverity && <span aria-label={t("diffViewer.hasFindings")} style={s.findingDot(dotSeverity)} />}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln)}
                findingApi={findingApi}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findingApi && <UnmatchedFindings items={unmatchedFindings} findingApi={findingApi} />}
        </div>
      )}
    </div>
  );
}
