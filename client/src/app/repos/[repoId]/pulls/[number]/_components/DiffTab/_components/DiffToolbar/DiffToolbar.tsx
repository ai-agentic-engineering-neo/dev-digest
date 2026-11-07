/* DiffToolbar — i18n-free (strings as props) so /showcase can mount it. Spec: client/specs/smart-diff.md (C4, C10) */
"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export type DiffMode = "smart" | "original";

export interface FindingsToggle {
  label: string;
  shown: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export interface DiffToolbarLabels {
  toolbar: string;
  smart: string;
  original: string;
}

export interface DiffToolbarProps {
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
  findingsToggle: FindingsToggle;
  labels: DiffToolbarLabels;
}

export function DiffToolbar({ mode, onModeChange, findingsToggle, labels }: DiffToolbarProps) {
  return (
    <div role="group" aria-label={labels.toolbar} style={s.group}>
      <Button type="button" kind="tertiary" size="sm" active={mode === "smart"} onClick={() => onModeChange("smart")}>
        {labels.smart}
      </Button>
      <Button
        type="button"
        kind="tertiary"
        size="sm"
        active={mode === "original"}
        onClick={() => onModeChange("original")}
      >
        {labels.original}
      </Button>
      <Button
        type="button"
        kind="ghost"
        size="sm"
        icon={findingsToggle.shown ? "EyeOff" : "Eye"}
        disabled={findingsToggle.disabled}
        onClick={findingsToggle.onToggle}
      >
        {findingsToggle.label}
      </Button>
    </div>
  );
}

export default DiffToolbar;
