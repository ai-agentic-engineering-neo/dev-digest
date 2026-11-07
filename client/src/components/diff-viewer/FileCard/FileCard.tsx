/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { SeverityTally, countSeverities } from "@/components/severity-tally";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card";
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
import { activeFindings, partitionFindings, topSeverity, type DiffFindingApi } from "../findings";
import { s, chevronFor, fileDotFor } from "../styles";
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

/** Findings anchored to a given parsed line (findings sit on the RIGHT side). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  open,
  onToggle,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Controlled expansion; undefined → internal state (auto-expands small files). */
  open?: boolean;
  onToggle?: () => void;
}) {
  const t = useTranslations("shell");
  const [internalOpen, setInternalOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const isOpen = open ?? internalOpen;
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const allFindings = findings?.findings;
  const fileFindings = React.useMemo(
    () => (allFindings ?? []).filter((f) => f.file === file.path),
    [allFindings, file.path]
  );
  const active = activeFindings(fileFindings);
  const topSev = topSeverity(active);
  const { matched: matchedFindings, outOfPatch } = React.useMemo(
    () => partitionFindings(fileFindings, renderedKeys),
    [fileFindings, renderedKeys]
  );

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => (onToggle ? onToggle() : setInternalOpen((o) => !o))}
        style={s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(isOpen)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {findings && topSev && (
          <>
            <span
              role="img"
              aria-label={findings.labels.fileDot(active.length)}
              style={fileDotFor(SEV_COLOR[topSev] ?? SEV_COLOR_FALLBACK)}
            />
            <SeverityTally counts={countSeverities(active)} label={findings.labels.severityCount} />
          </>
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            role="img"
            aria-label={t("diffViewer.commentCount", { count: commentCount })}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </button>
      {isOpen && (
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
                findings={findings ? findingsForLine(ln, matchedFindings) : undefined}
                findingApi={findings}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.show && outOfPatch.length > 0 && (
            <div style={cs.outdatedWrap}>
              <span style={cs.outdatedTitle}>{findings.labels.outOfPatch}</span>
              {outOfPatch.map((f) => (
                <React.Fragment key={f.id}>{findings.renderCard(f)}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
