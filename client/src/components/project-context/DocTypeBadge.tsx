"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ContextDocType } from "@devdigest/shared";
import { DOC_TYPE_COLOR } from "./constants";

export function DocTypeBadge({ type }: { type: ContextDocType }) {
  const t = useTranslations("context");
  const color = DOC_TYPE_COLOR[type];
  return (
    <span
      className="mono"
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        padding: "2px 8px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {t(`type.${type}`)}
    </span>
  );
}
