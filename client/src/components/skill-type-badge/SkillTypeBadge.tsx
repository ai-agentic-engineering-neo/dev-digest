/* SkillTypeBadge — coloured chip for a skill's type (rubric / convention /
   security / custom). Label comes from the caller (translated), so it renders
   on /showcase without a NextIntlClientProvider. */
import React from "react";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "./constants";

export interface SkillTypeBadgeProps {
  type: SkillType;
  label: string;
}

export function SkillTypeBadge({ type, label }: SkillTypeBadgeProps) {
  const c = SKILL_TYPE_COLOR[type];
  return (
    <Badge color={c.color} bg={c.bg} mono>
      {label}
    </Badge>
  );
}
