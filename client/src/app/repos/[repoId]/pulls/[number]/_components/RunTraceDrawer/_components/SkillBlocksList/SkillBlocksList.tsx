/* SkillBlocksList — M2: which skills were appended to the system prompt of this
   run, in prompt order, with each block's token cost. Disabled skills never
   appear here (they never reached the prompt). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillBlockTrace } from "@devdigest/shared";
import { s } from "./styles";

export function SkillBlocksList({ blocks }: { blocks: SkillBlockTrace[] }) {
  const t = useTranslations("runs");
  return (
    <ol aria-label={t("trace.skillBlocks.aria")} style={s.list}>
      {blocks.map((b, i) => (
        <li key={b.skill_id} style={s.item}>
          <span className="tnum" style={s.pos}>
            {i + 1}.
          </span>
          <span className="mono" style={s.name}>
            {b.name}
          </span>
          <span style={s.version}>{t("trace.skillBlocks.version", { version: b.version })}</span>
          {b.source !== "manual" && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("trace.skillBlocks.imported")}
            </Badge>
          )}
          <span className="tnum" style={s.tokens}>
            {t("trace.skillBlocks.tokens", { count: b.tokens })}
          </span>
        </li>
      ))}
    </ol>
  );
}
