/* SkillTypeChip — coloured type label for a skill (rubric / convention / …). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { TYPE_COLORS } from "./constants";

export function SkillTypeChip({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const color = TYPE_COLORS[type];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        padding: "1px 8px",
        borderRadius: 4,
        flexShrink: 0,
      }}
    >
      {t(`type.${type}`)}
    </span>
  );
}
