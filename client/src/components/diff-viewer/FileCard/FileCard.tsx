/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { findLineTarget, parsePatch, type Line } from "../helpers";
import type { LineRange } from "../focus";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
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

export function FileCard({
  file,
  commenting,
  focused = false,
  focusLines = null,
  focusMissingNote = null,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Deep-linked file: mounts open and scrolls its header into view. */
  focused?: boolean;
  /** Deep-linked new-side line range inside the focused file. */
  focusLines?: LineRange | null;
  /** Announced under the header when the target line is not part of the diff. */
  focusMissingNote?: string | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    focused || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const headerRef = React.useRef<HTMLDivElement>(null);
  const targetRowRef = React.useRef<HTMLDivElement>(null);
  const handledTarget = React.useRef<string | null>(null);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const rangeStart = focusLines?.start;
  const rangeEnd = focusLines?.end;
  const lineTarget = React.useMemo(
    () =>
      focused && rangeStart !== undefined && rangeEnd !== undefined
        ? findLineTarget(lines, { start: rangeStart, end: rangeEnd })
        : null,
    [focused, lines, rangeStart, rangeEnd]
  );
  const hasLineTarget = focused && rangeStart !== undefined;

  // Focus can move to this card without a remount: open it, then scroll to the
  // target line (or the header) once per new target.
  React.useEffect(() => {
    if (!focused) {
      handledTarget.current = null;
      return;
    }
    const key = rangeStart !== undefined ? `${rangeStart}-${rangeEnd}` : "header";
    if (handledTarget.current === key) return; // already scrolled; let the user collapse the card
    if (!open) {
      setOpen(true);
      return;
    }
    handledTarget.current = key;
    if (lineTarget && targetRowRef.current) {
      targetRowRef.current.scrollIntoView({ block: "center" });
      targetRowRef.current.focus();
      return;
    }
    headerRef.current?.scrollIntoView({ block: "start" });
    if (rangeStart !== undefined) headerRef.current?.focus();
  }, [focused, open, rangeStart, rangeEnd, lineTarget]);

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

  return (
    <div style={s.fileCard}>
      <div ref={headerRef} tabIndex={-1} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
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
      {hasLineTarget && !lineTarget && focusMissingNote && (
        <div role="status" style={s.focusNote}>
          {focusMissingNote}
        </div>
      )}
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
                highlighted={lineTarget?.highlighted.has(i) ?? false}
                rowRef={lineTarget?.targetIndex === i ? targetRowRef : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
