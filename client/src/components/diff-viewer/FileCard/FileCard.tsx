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
  cs,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, type DiffFindingApi } from "../findings";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

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

/** Findings anchored to a given parsed line (RIGHT side only). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  return keysForLine(ln).flatMap((key) => matched.get(key) ?? []);
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
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

  // Same split for review findings; off-diff ones are listed, never dropped.
  // They share the comments toggle: hiding comments also hides inline findings
  // (the file dot and group counts stay). Without a toggle they always show.
  const showFindings = commenting ? commenting.showComments : true;
  const allFindings = findings?.findings;
  const { matched: matchedFindings, offDiff } = React.useMemo(() => {
    const fileFindings = showFindings
      ? (allFindings ?? []).filter((f) => f.file === file.path)
      : [];
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionFindings(fileFindings, renderedKeys);
  }, [allFindings, showFindings, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findings?.flaggedPaths.has(file.path) && (
          <span role="img" aria-label={t("diffViewer.hasFindings")} style={s.findingDot} />
        )}
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
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findings}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && offDiff.length > 0 && (
            <div style={cs.outdatedWrap}>
              <span style={cs.outdatedTitle}>{t("diffViewer.offDiffFindings")}</span>
              {offDiff.map((f) => (
                <FindingCard
                  key={f.id}
                  f={f}
                  defaultExpanded
                  onAction={(a) => findings.onAction(f.id, a)}
                  pending={findings.pendingFindingId === f.id}
                  repoFullName={findings.repoFullName}
                  headSha={findings.headSha}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
