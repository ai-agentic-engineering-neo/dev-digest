/* FindingMarker — the clickable severity label on a code line ("blocker" /
   "warning" / "suggestion", +N when several findings share the line). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Severity } from "@devdigest/shared";
import { SEV } from "@devdigest/ui";
import { FINDING_LABEL_KEY } from "../constants";
import { findingMarkerStyle } from "../styles";

export function FindingMarker({
  severity,
  count,
  muted,
  open,
  onClick,
}: {
  severity: Severity;
  /** Total findings this label represents (active, or dismissed when muted). */
  count: number;
  muted?: boolean;
  open: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("shell.diffViewer");
  const label = t(FINDING_LABEL_KEY[severity]);
  const text = count > 1 ? t("findingLabelMore", { label, count: count - 1 }) : label;

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      style={findingMarkerStyle(SEV[severity].c, !!muted)}
    >
      {text}
    </button>
  );
}
