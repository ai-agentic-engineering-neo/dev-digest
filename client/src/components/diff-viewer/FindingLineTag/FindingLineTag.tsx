/* FindingLineTag — small severity pill at the right of a diff row that has
   review findings; shows the highest severity among them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card/constants";
import { TAG_KEY } from "./constants";
import { topSeverity } from "./helpers";

export function FindingLineTag({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("shell");
  const top = topSeverity(findings);
  if (!top) return null;
  const color = SEV_COLOR[top] ?? SEV_COLOR_FALLBACK;
  const key = TAG_KEY[top] ?? "suggestion";
  return (
    <span
      style={{
        alignSelf: "center",
        flexShrink: 0,
        marginRight: 10,
        padding: "0 8px",
        borderRadius: 999,
        fontSize: 11,
        lineHeight: "16px",
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
      }}
    >
      {t(`diffViewer.findingTag.${key}`)}
    </span>
  );
}
