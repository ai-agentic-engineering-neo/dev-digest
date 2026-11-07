/* GroupHeader — sticky header of one Smart Diff role group.
   i18n-free by design: /showcase renders it without an intl provider, so callers pass `labels`.
   Spec: client/specs/smart-diff.md (C2, C5, C15) */
"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface GroupHeaderLabels {
  title: string;
  description: string;
  /** e.g. "3 files" */
  files: string;
  /** e.g. "● 2" — shown only when `findingFiles > 0` */
  findingFiles: string;
  findingFilesHint: string;
  toggleAll: string;
}

export interface GroupHeaderProps {
  color: string;
  findingFiles: number;
  allOpen: boolean;
  onToggleAll: () => void;
  /** Offset (px) below the sticky PrDetailHeader. */
  stickyTop: number;
  labels: GroupHeaderLabels;
}

export function GroupHeader({ color, findingFiles, allOpen, onToggleAll, stickyTop, labels }: GroupHeaderProps) {
  return (
    <div style={s.root(stickyTop)}>
      <span aria-hidden="true" style={s.marker(color)} />
      <h3 style={s.title}>{labels.title}</h3>
      <span style={s.description}>{labels.description}</span>
      <div style={s.right}>
        {findingFiles > 0 && (
          <span style={s.findingFiles} title={labels.findingFilesHint} aria-label={labels.findingFilesHint}>
            {labels.findingFiles}
          </span>
        )}
        <span style={s.files}>{labels.files}</span>
        <Button type="button" kind="tertiary" size="sm" aria-expanded={allOpen} onClick={onToggleAll}>
          {labels.toggleAll}
        </Button>
      </div>
    </div>
  );
}

export default GroupHeader;
