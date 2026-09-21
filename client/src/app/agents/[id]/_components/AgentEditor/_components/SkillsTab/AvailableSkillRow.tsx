"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SkillRowContent } from "./SkillRowContent";
import type { SkillRow } from "./helpers";
import { s } from "./styles";

/** One static (not draggable, no grip) row of the Available group. */
export function AvailableSkillRow({ row, onToggle }: { row: SkillRow; onToggle: (id: string) => void }) {
  const t = useTranslations("agents");
  const { skill } = row;
  return (
    <div
      style={s.row({ flagged: skill.injection_detected, dimmed: !skill.enabled })}
      data-testid={`skill-row-${skill.id}`}
      title={skill.enabled ? undefined : t("skills.disabledTitle")}
    >
      <SkillRowContent row={row} onToggle={onToggle} />
    </div>
  );
}
